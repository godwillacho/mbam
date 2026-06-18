/// Fail-closed helper for the authentication layer.
///
/// This file provides simple helpers that make denial behavior explicit while
/// the Keycloak migration is being implemented.
pub struct AccessDenied;

impl AccessDenied {
    /// Returns a standard denial message for unresolved identity.
    pub fn unresolved_identity() -> &'static str {
        "identity could not be resolved"
    }

    /// Returns a standard denial message for unresolved baseline role.
    pub fn unresolved_baseline() -> &'static str {
        "baseline role could not be resolved"
    }

    /// Returns a standard denial message for unresolved membership scope.
    pub fn unresolved_scope() -> &'static str {
        "membership scope could not be resolved"
    }
}
