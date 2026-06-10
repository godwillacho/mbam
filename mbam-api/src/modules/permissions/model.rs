use uuid::Uuid;

/// Permission record used by role permission checks.
pub struct Permission {
    pub id: Uuid,
    pub code: String,
    pub description: String,
}
