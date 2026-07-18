use std::collections::HashMap;
use std::sync::RwLock;

#[derive(Clone, Debug)]
pub struct UserCredential {
    pub id: String,
    pub username: String,
    pub password_plain: String,
    pub max_connections: u32,
    pub is_active: bool,
}

pub struct AuthManager {
    // port -> username -> credential
    users: RwLock<HashMap<u16, HashMap<String, UserCredential>>>,
}

impl AuthManager {
    pub fn new() -> Self {
        Self {
            users: RwLock::new(HashMap::new()),
        }
    }

    pub fn authenticate(&self, port: u16, username: &str, password_plain: &str) -> Option<UserCredential> {
        let guard = self.users.read().ok()?;
        let port_users = guard.get(&port)?;
        let cred = port_users.get(username)?;
        if cred.is_active && cred.password_plain == password_plain {
            Some(cred.clone())
        } else {
            None
        }
    }

    pub fn add_user(&self, port: u16, cred: UserCredential) {
        let mut guard = self.users.write().unwrap();
        guard
            .entry(port)
            .or_insert_with(HashMap::new)
            .insert(cred.username.clone(), cred);
    }

    pub fn remove_user(&self, port: u16, username: &str) {
        let mut guard = self.users.write().unwrap();
        if let Some(port_users) = guard.get_mut(&port) {
            port_users.remove(username);
        }
    }

    pub fn clear_port(&self, port: u16) {
        let mut guard = self.users.write().unwrap();
        guard.remove(&port);
    }
}
