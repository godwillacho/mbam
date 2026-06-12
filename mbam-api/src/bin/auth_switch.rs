use std::io::{self, Write};

fn main() {
    loop {
        print_menu();
        let choice = read_choice();

        match choice.trim() {
            "1" => print_google_oauth_start_url(),
            "2" => print_microsoft_oauth_start_url(),
            "3" => simulate_owner_oauth_callback(),
            "4" => create_cashier_invite_plan(),
            "5" => inspect_invite_plan(),
            "6" => simulate_invited_cashier_profile_completion(),
            "7" => login_as_seeded_owner_plan(),
            "8" => login_as_seeded_cashier_plan(),
            "9" => call_auth_me_plan(),
            "0" => {
                println!("Exiting auth switch.");
                break;
            }
            _ => println!("Unknown option. Choose one of the listed numbers."),
        }

        println!();
    }
}

fn print_menu() {
    println!("Mbam Auth Switch");
    println!("================");
    println!("1. Print Google OAuth start URL");
    println!("2. Print Microsoft OAuth start URL");
    println!("3. Simulate owner OAuth callback with mock provider identity");
    println!("4. Create invite for cashier email");
    println!("5. Inspect invite by token/email");
    println!("6. Simulate invited cashier profile completion");
    println!("7. Login as seeded owner");
    println!("8. Login as seeded cashier");
    println!("9. Call /auth/me with a token");
    println!("0. Exit");
    print!("Choose an option: ");
    let _ = io::stdout().flush();
}

fn read_choice() -> String {
    let mut input = String::new();
    if io::stdin().read_line(&mut input).is_err() {
        return String::new();
    }
    input
}

fn base_url() -> String {
    std::env::var("MBAM_API_URL").unwrap_or_else(|_| "http://127.0.0.1:8080".to_string())
}

fn print_google_oauth_start_url() {
    println!("Open this URL in the browser once the route is implemented:");
    println!("{}/api/v1/auth/oauth/google/start", base_url());
}

fn print_microsoft_oauth_start_url() {
    println!("Open this URL in the browser once the route is implemented:");
    println!("{}/api/v1/auth/oauth/microsoft/start", base_url());
}

fn simulate_owner_oauth_callback() {
    println!("Pending implementation: owner OAuth callback simulation.");
    println!("Expected behavior:");
    println!("- accept mock provider: google | microsoft");
    println!("- accept provider subject, verified email, display name");
    println!("- create/find user");
    println!("- create master account for first owner signup");
    println!("- issue access and refresh tokens");
}

fn create_cashier_invite_plan() {
    println!("Pending implementation: cashier invite creation.");
    println!("Expected POST once route exists:");
    println!("curl -X POST {}/api/v1/invites \\", base_url());
    println!("  -H 'Authorization: Bearer <owner-token>' \\");
    println!("  -H 'Content-Type: application/json' \\");
    println!("  -d '{{\"email\":\"cashier@example.com\",\"role_code\":\"cashier\",\"business_unit_id\":\"<shop-id>\"}}'");
}

fn inspect_invite_plan() {
    println!("Pending implementation: invite inspection.");
    println!("Expected GET once route exists:");
    println!("curl {}/api/v1/invites/<invite-token>", base_url());
}

fn simulate_invited_cashier_profile_completion() {
    println!("Pending implementation: invited cashier profile completion.");
    println!("Required profile fields:");
    println!("- name");
    println!("- surname");
    println!("- contact");
    println!("- preferred_name");
}

fn login_as_seeded_owner_plan() {
    println!("Pending implementation: seeded owner login.");
    println!("This should eventually create or fetch a seeded owner and print an access token.");
}

fn login_as_seeded_cashier_plan() {
    println!("Pending implementation: seeded cashier login.");
    println!("This should eventually create or fetch a seeded cashier membership and print an access token.");
}

fn call_auth_me_plan() {
    println!("Pending implementation: call /auth/me.");
    println!("Expected GET once route exists:");
    println!(
        "curl {}/api/v1/auth/me -H 'Authorization: Bearer <token>'",
        base_url()
    );
}
