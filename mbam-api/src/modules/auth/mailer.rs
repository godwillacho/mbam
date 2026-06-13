use lettre::{
    message::{header::ContentType, Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

use crate::{config::Config, error::ApiError};

pub async fn send_password_reset(
    config: &Config,
    recipient_name: &str,
    recipient_email: &str,
    reset_url: &str,
) -> Result<(), ApiError> {
    let host = config.smtp_host.as_deref().ok_or(ApiError::Internal)?;
    let username = config.smtp_username.as_deref().ok_or(ApiError::Internal)?;
    let password = config.smtp_password.as_deref().ok_or(ApiError::Internal)?;
    let from_email = config
        .smtp_from_email
        .as_deref()
        .ok_or(ApiError::Internal)?;

    let from = Mailbox::new(
        Some(config.smtp_from_name.clone()),
        from_email.parse().map_err(|_| ApiError::Internal)?,
    );
    let to = Mailbox::new(
        Some(recipient_name.to_string()),
        recipient_email.parse().map_err(|_| ApiError::Internal)?,
    );
    let text = format!(
        "A password reset was requested for your Mbam account.\n\nReset your password: {reset_url}\n\nThis link expires in 30 minutes. If you did not request it, ignore this email."
    );
    let html = format!(
        "<p>A password reset was requested for your Mbam account.</p><p><a href=\"{reset_url}\">Reset your password</a></p><p>This link expires in 30 minutes. If you did not request it, ignore this email.</p>"
    );
    let message = Message::builder()
        .from(from)
        .to(to)
        .subject("Reset your Mbam password")
        .multipart(
            MultiPart::alternative()
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_PLAIN)
                        .body(text),
                )
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_HTML)
                        .body(html),
                ),
        )
        .map_err(|_| ApiError::Internal)?;

    let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)
        .map_err(|_| ApiError::Internal)?
        .port(config.smtp_port)
        .credentials(Credentials::new(username.to_string(), password.to_string()))
        .build();

    mailer.send(message).await.map_err(|_| ApiError::Internal)?;
    Ok(())
}
