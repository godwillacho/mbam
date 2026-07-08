//! Development-only fixtures and demo data.
//!
//! Everything here is only invoked when `config.app_env == "development"`
//! (see `main.rs`) and has no effect on production startup or behavior.
//! Grouped together so it's obvious at a glance which code is test/demo
//! scaffolding versus real application logic -- see `README.md`.

pub mod demo_data;
pub mod seed;
pub mod seed_cleanup;
