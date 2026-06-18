/// Authenticated client context for MBAM sessions.
///
/// Keycloak proves user identity. MBAM still needs a local client context so
/// offline grants, sync queues, and dashboard snapshots can be tied to the
/// browser profile that created them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionClientContext {
    /// Stable browser-generated client identifier supplied by the web client.
    pub client_id: String,
}

impl SessionClientContext {
    /// Creates a new client context after request metadata has been parsed.
    pub fn new(client_id: impl Into<String>) -> Self {
        Self {
            client_id: client_id.into(),
        }
    }

    /// Returns true when the client id is syntactically usable.
    ///
    /// This does not prove identity. It only prevents empty local session records
    /// from being accepted by offline and synchronization services.
    pub fn has_valid_client_id(&self) -> bool {
        let trimmed = self.client_id.trim();
        !trimmed.is_empty() && trimmed.len() <= 128
    }
}

/// Result of checking whether a client context may use a session.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionBindingDecision {
    /// Whether the request may continue.
    pub allowed: bool,
    /// Reason to write to debug/error logs.
    pub reason: String,
}

impl SessionBindingDecision {
    /// Builds an allow decision for a valid context.
    pub fn allow(reason: impl Into<String>) -> Self {
        Self {
            allowed: true,
            reason: reason.into(),
        }
    }

    /// Builds a deny decision for an invalid context.
    pub fn deny(reason: impl Into<String>) -> Self {
        Self {
            allowed: false,
            reason: reason.into(),
        }
    }
}
