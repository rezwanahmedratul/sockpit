use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::RwLock;

pub struct ConnectionLimiter {
    // user_id -> current active count
    connections: RwLock<HashMap<String, &'static AtomicU32>>,
    // user_id -> max allowed connections limit
    limits: RwLock<HashMap<String, u32>>,
}

impl ConnectionLimiter {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
            limits: RwLock::new(HashMap::new()),
        }
    }

    pub fn try_acquire(&self, user_id: &str) -> bool {
        let limits_guard = self.limits.read().unwrap();
        let max_allowed = *limits_guard.get(user_id).unwrap_or(&1);

        let mut conns_guard = self.connections.write().unwrap();
        
        let counter = conns_guard.entry(user_id.to_string()).or_insert_with(|| {
            // Allocate a static AtomicU32 counter on heap (leaked intentionally for static lifetime safety)
            Box::leak(Box::new(AtomicU32::new(0)))
        });

        // Load and increment atomically
        let current = counter.load(Ordering::SeqCst);
        if current >= max_allowed {
            false
        } else {
            counter.fetch_add(1, Ordering::SeqCst);
            true
        }
    }

    pub fn release(&self, user_id: &str) {
        let guard = self.connections.read().unwrap();
        if let Some(counter) = guard.get(user_id) {
            let current = counter.load(Ordering::SeqCst);
            if current > 0 {
                counter.fetch_sub(1, Ordering::SeqCst);
            }
        }
    }

    pub fn set_limit(&self, user_id: &str, max: u32) {
        let mut guard = self.limits.write().unwrap();
        guard.insert(user_id.to_string(), max);
    }

    pub fn remove_user(&self, user_id: &str) {
        let mut limits_guard = self.limits.write().unwrap();
        limits_guard.remove(user_id);
        
        let mut conns_guard = self.connections.write().unwrap();
        conns_guard.remove(user_id);
    }

    pub fn get_count(&self, user_id: &str) -> u32 {
        let guard = self.connections.read().unwrap();
        if let Some(counter) = guard.get(user_id) {
            counter.load(Ordering::SeqCst)
        } else {
            0
        }
    }
}
