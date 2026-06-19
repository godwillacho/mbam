use std::time::Duration;

use reqwest::{Client, Method, StatusCode, Url};
use sqlx::PgPool;

use crate::config::Config;

use super::{
    model::{KeycloakRoleRepresentation, KeycloakTokenResponse, OutboxJob},
    repository,
};

const BASELINE_ROLES: [&str; 4] = ["master_owner", "business_admin", "shop_manager", "cashier"];

pub fn spawn_worker(db: PgPool, config: Config) {
    if config.auth_provider != "keycloak" {
        return;
    }
    tokio::spawn(async move {
        let client = Client::new();
        loop {
            match repository::claim(&db).await {
                Ok(Some(job)) => process(&client, &db, &config, &job).await,
                Ok(None) => tokio::time::sleep(Duration::from_secs(2)).await,
                Err(error) => {
                    tracing::error!(?error, "keycloak reconciliation claim failed");
                    tokio::time::sleep(Duration::from_secs(5)).await;
                }
            }
        }
    });
}

async fn process(client: &Client, db: &PgPool, config: &Config, job: &OutboxJob) {
    match reconcile(client, db, config, job).await {
        Ok(()) => {
            if let Err(error) = repository::succeed(db, job).await {
                tracing::error!(?error, "keycloak reconciliation completion failed");
            }
        }
        Err(message) => {
            if let Err(error) = repository::fail(db, job, &message).await {
                tracing::error!(
                    ?error,
                    "keycloak reconciliation failure state could not persist"
                );
            }
        }
    }
}

async fn reconcile(
    client: &Client,
    db: &PgPool,
    config: &Config,
    job: &OutboxJob,
) -> Result<(), String> {
    let subject = repository::keycloak_subject(db, job.user_id)
        .await
        .map_err(|_| "keycloak identity lookup failed".to_string())?
        .ok_or_else(|| "keycloak identity is not provisioned".to_string())?;
    let issuer = config
        .keycloak_issuer_url
        .as_deref()
        .ok_or_else(|| "keycloak issuer is not configured".to_string())?;
    let client_id = config
        .keycloak_client_id
        .as_deref()
        .ok_or_else(|| "keycloak client is not configured".to_string())?;
    let client_secret = config
        .keycloak_client_secret
        .as_deref()
        .ok_or_else(|| "keycloak client secret is not configured".to_string())?;
    let token = client
        .post(format!("{issuer}/protocol/openid-connect/token"))
        .form(&[
            ("grant_type", "client_credentials"),
            ("client_id", client_id),
            ("client_secret", client_secret),
        ])
        .send()
        .await
        .map_err(|_| "keycloak token request failed".to_string())?
        .error_for_status()
        .map_err(|_| "keycloak rejected service authentication".to_string())?
        .json::<KeycloakTokenResponse>()
        .await
        .map_err(|_| "keycloak token response was invalid".to_string())?
        .access_token;
    let admin_base = admin_base(issuer)?;
    let mapped = client
        .get(format!("{admin_base}/users/{subject}/role-mappings/realm"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|_| "keycloak role lookup failed".to_string())?
        .error_for_status()
        .map_err(|_| "keycloak denied role lookup".to_string())?
        .json::<Vec<KeycloakRoleRepresentation>>()
        .await
        .map_err(|_| "keycloak role mapping response was invalid".to_string())?;
    let current = mapped
        .into_iter()
        .filter(|role| BASELINE_ROLES.contains(&role.name.as_str()))
        .collect::<Vec<_>>();
    let desired_role = if let Some(desired) = job.desired_baseline_role.as_deref() {
        Some(
            client
                .get(format!("{admin_base}/roles/{desired}"))
                .bearer_auth(&token)
                .send()
                .await
                .map_err(|_| "keycloak desired role lookup failed".to_string())?
                .error_for_status()
                .map_err(|_| "keycloak desired role is unavailable".to_string())?
                .json::<KeycloakRoleRepresentation>()
                .await
                .map_err(|_| "keycloak desired role response was invalid".to_string())?,
        )
    } else {
        None
    };
    if let Some(role) = desired_role.as_ref() {
        if !current.iter().any(|current| current.name == role.name) {
            role_mapping_request(
                client,
                Method::POST,
                &format!("{admin_base}/users/{subject}/role-mappings/realm"),
                &token,
                std::slice::from_ref(role),
            )
            .await?;
        }
    }
    let obsolete = current
        .into_iter()
        .filter(|current| {
            desired_role
                .as_ref()
                .map_or(true, |desired| current.name != desired.name)
        })
        .collect::<Vec<_>>();
    if !obsolete.is_empty() {
        role_mapping_request(
            client,
            Method::DELETE,
            &format!("{admin_base}/users/{subject}/role-mappings/realm"),
            &token,
            &obsolete,
        )
        .await?;
    }
    Ok(())
}

async fn role_mapping_request(
    client: &Client,
    method: Method,
    url: &str,
    token: &str,
    roles: &[KeycloakRoleRepresentation],
) -> Result<(), String> {
    let response = client
        .request(method, url)
        .bearer_auth(token)
        .json(roles)
        .send()
        .await
        .map_err(|_| "keycloak role update failed".to_string())?;
    if matches!(response.status(), StatusCode::NO_CONTENT | StatusCode::OK) {
        Ok(())
    } else {
        Err("keycloak rejected role update".to_string())
    }
}

fn admin_base(issuer: &str) -> Result<String, String> {
    let url = Url::parse(issuer).map_err(|_| "keycloak issuer URL is invalid".to_string())?;
    let segments = url
        .path_segments()
        .ok_or_else(|| "keycloak issuer realm is missing".to_string())?
        .collect::<Vec<_>>();
    let realm_index = segments
        .iter()
        .position(|segment| *segment == "realms")
        .ok_or_else(|| "keycloak issuer realm is missing".to_string())?;
    let realm = segments
        .get(realm_index + 1)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "keycloak issuer realm is missing".to_string())?;
    Ok(format!(
        "{}://{}{}/admin/realms/{realm}",
        url.scheme(),
        url.host_str()
            .ok_or_else(|| "keycloak issuer host is missing".to_string())?,
        url.port()
            .map(|port| format!(":{port}"))
            .unwrap_or_default()
    ))
}

#[cfg(test)]
mod tests {
    use super::admin_base;

    #[test]
    fn builds_admin_base_from_realm_issuer() {
        assert_eq!(
            admin_base("http://localhost:8081/realms/mbam").expect("admin base"),
            "http://localhost:8081/admin/realms/mbam"
        );
    }
}
