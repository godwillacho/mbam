use std::collections::BTreeSet;

use sqlx::PgPool;

use crate::{
    authentication::{AuthorizationContext, BaselineRole},
    error::ApiError,
};

use super::{
    model::{
        AuthorizationBootstrapResponse, AuthorizationIdentityResponse, AuthorizedRouteResponse,
    },
    repository,
};

/// Builds the current user's fail-closed online authorization bootstrap.
///
/// Inputs are the database pool and normalized request context; output contains
/// only the caller's identity, baseline role, permissions, scopes, dashboard,
/// routes, and authorization version. Database failures use the central API
/// error. This function does not return other employees, invitations, role
/// definitions, or authorize later domain requests.
pub async fn bootstrap(
    db: &PgPool,
    authorization: AuthorizationContext,
) -> Result<AuthorizationBootstrapResponse, ApiError> {
    let business_ids = authorization
        .authorized_business_ids
        .iter()
        .copied()
        .collect::<Vec<_>>();
    let business_unit_ids = authorization
        .authorized_business_unit_ids
        .iter()
        .copied()
        .collect::<Vec<_>>();
    let account_ids = authorization
        .authorized_business_account_ids
        .iter()
        .copied()
        .collect::<Vec<_>>();
    let businesses = repository::businesses(db, &business_ids).await?;
    let business_units = repository::business_units(db, &business_unit_ids).await?;
    let baseline_permissions =
        repository::baseline_permissions(db, &account_ids, authorization.baseline_role.code())
            .await?
            .into_iter()
            .collect::<BTreeSet<_>>();
    let permissions = authorization
        .permissions
        .iter()
        .cloned()
        .collect::<Vec<_>>();
    let custom_permissions = authorization
        .permissions
        .difference(&baseline_permissions)
        .cloned()
        .collect::<Vec<_>>();
    let dashboard_type = dashboard_type(authorization.baseline_role).to_string();
    let dashboard_path = dashboard_path(authorization.baseline_role).to_string();
    let authorized_routes =
        authorized_routes(authorization.baseline_role, &authorization.permissions);

    Ok(AuthorizationBootstrapResponse {
        identity: AuthorizationIdentityResponse {
            user_id: authorization.user_id,
            keycloak_subject: authorization.keycloak_subject,
            full_name: authorization.full_name,
            email: authorization.email,
        },
        baseline_role: authorization.baseline_role.code().to_string(),
        permissions,
        custom_permissions,
        active_membership_ids: authorization.active_membership_ids.into_iter().collect(),
        authorized_business_account_ids: account_ids,
        businesses,
        business_units,
        dashboard_type,
        dashboard_path,
        authorized_routes,
        authorization_version: authorization.authorization_version,
    })
}

fn dashboard_type(role: BaselineRole) -> &'static str {
    match role {
        BaselineRole::MasterOwner => "master",
        BaselineRole::BusinessAdmin => "business",
        BaselineRole::ShopManager => "shop",
        BaselineRole::Cashier => "personal",
    }
}

fn dashboard_path(role: BaselineRole) -> &'static str {
    match role {
        BaselineRole::MasterOwner => "/dashboard/master",
        BaselineRole::BusinessAdmin => "/dashboard/business",
        BaselineRole::ShopManager => "/dashboard/shop",
        BaselineRole::Cashier => "/dashboard/personal",
    }
}

fn authorized_routes(
    role: BaselineRole,
    permissions: &BTreeSet<String>,
) -> Vec<AuthorizedRouteResponse> {
    let mut routes = vec![route("dashboard", dashboard_path(role))];
    add_route(
        &mut routes,
        permissions,
        "screen.record_transaction",
        "recordTransaction",
        "/transactions/new",
        true,
    );
    add_route(
        &mut routes,
        permissions,
        "screen.transaction_drafts",
        "transactionDrafts",
        "/transactions/drafts",
        true,
    );
    add_route(
        &mut routes,
        permissions,
        "screen.transactions",
        "transactions",
        "/transactions",
        true,
    );
    add_route(
        &mut routes,
        permissions,
        "screen.businesses",
        "businesses",
        "/businesses",
        matches!(
            role,
            BaselineRole::MasterOwner | BaselineRole::BusinessAdmin
        ),
    );
    add_route(
        &mut routes,
        permissions,
        "screen.reports",
        "shops",
        "/shops",
        true,
    );
    add_route(
        &mut routes,
        permissions,
        "screen.team",
        "team",
        "/employees",
        role != BaselineRole::Cashier,
    );
    add_route(
        &mut routes,
        permissions,
        "screen.products",
        "products",
        "/products",
        true,
    );
    // Stock unlocks on EITHER capability, not just `screen.stock`: a hybrid
    // role granted only `stock.movement.create` (via the TeamAccessPage
    // "Add stock movements" toggle, no full ledger/screen access) still
    // needs to reach `/stock` to actually use that permission --
    // StockPage.tsx itself shows the ledger only with view rights and the
    // record-movement form only with create rights, so this route-key gate
    // only needs to confirm the user has at least one of the two.
    if role != BaselineRole::Cashier
        && (permissions.contains("screen.stock") || permissions.contains("stock.movement.create"))
    {
        routes.push(route("stock", "/stock"));
    }
    add_route(
        &mut routes,
        permissions,
        "screen.reports",
        "reports",
        "/reports",
        true,
    );
    routes
}

fn add_route(
    routes: &mut Vec<AuthorizedRouteResponse>,
    permissions: &BTreeSet<String>,
    permission: &str,
    key: &str,
    path: &str,
    role_allows: bool,
) {
    if role_allows && permissions.contains(permission) {
        routes.push(route(key, path));
    }
}

fn route(key: &str, path: &str) -> AuthorizedRouteResponse {
    AuthorizedRouteResponse {
        key: key.to_string(),
        path: path.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use crate::authentication::BaselineRole;

    use super::authorized_routes;

    fn keys(role: BaselineRole, permissions: &[&str]) -> Vec<String> {
        authorized_routes(
            role,
            &permissions.iter().map(|value| value.to_string()).collect(),
        )
        .into_iter()
        .map(|route| route.key)
        .collect()
    }

    #[test]
    fn shop_manager_permissions_cannot_restore_business_structure_access() {
        let route_keys = keys(
            BaselineRole::ShopManager,
            &[
                "screen.businesses",
                "screen.team",
                "screen.products",
                "screen.reports",
            ],
        );
        assert!(!route_keys.contains(&"businesses".to_string()));
        assert!(route_keys.contains(&"shops".to_string()));
        assert!(route_keys.contains(&"team".to_string()));
        assert!(route_keys.contains(&"products".to_string()));
    }

    #[test]
    fn cashier_permissions_cannot_restore_employee_management() {
        let route_keys = keys(
            BaselineRole::Cashier,
            &["screen.team", "screen.transactions"],
        );
        assert!(!route_keys.contains(&"team".to_string()));
        assert!(route_keys.contains(&"transactions".to_string()));
    }

    #[test]
    fn missing_screen_permission_fails_closed() {
        let route_keys = keys(BaselineRole::BusinessAdmin, &[]);
        assert_eq!(route_keys, vec!["dashboard".to_string()]);
    }

    #[test]
    fn cashier_role_cannot_access_stock_even_with_the_permission() {
        // Defense in depth, matching `team`'s test above: cashiers are never
        // actually granted `screen.stock` (see dev_seed.rs/dev_demo_data.rs/
        // team/repository.rs), but the route-key gate should fail closed on
        // role alone even if a permission row existed anyway.
        let route_keys = keys(BaselineRole::Cashier, &["screen.stock"]);
        assert!(!route_keys.contains(&"stock".to_string()));
    }

    #[test]
    fn shop_manager_with_stock_permission_gets_the_stock_route() {
        let route_keys = keys(BaselineRole::ShopManager, &["screen.stock"]);
        assert!(route_keys.contains(&"stock".to_string()));
    }

    #[test]
    fn hybrid_role_with_only_stock_create_permission_still_reaches_the_stock_route() {
        // A custom "Add stock movements" grant (TeamAccessPage's split
        // toggle) intentionally does not include `screen.stock` -- without
        // this OR, that permission would be unusable since nothing else in
        // the frontend exposes a way to record a movement.
        let route_keys = keys(BaselineRole::ShopManager, &["stock.movement.create"]);
        assert!(route_keys.contains(&"stock".to_string()));
    }

    #[test]
    fn cashier_role_cannot_access_stock_via_the_create_permission_either() {
        let route_keys = keys(BaselineRole::Cashier, &["stock.movement.create"]);
        assert!(!route_keys.contains(&"stock".to_string()));
    }
}
