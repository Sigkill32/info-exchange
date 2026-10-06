# login to postgres db

sudo docker exec -it phone-db psql -U postgres

# table schemas

CREATE TABLE connections (username TEXT PRIMARY KEY, status INT2 NOT NULL);
CREATE TABLE messages(id SERIAL PRIMARY KEY, message TEXT NOT NULL, destination_username TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), source_username TEXT REFERENCES connections(username) ON DELETE CASCADE);

# 1. Stop the server immediately

sudo systemctl stop nodeserver

# 2. Prevent it from starting automatically when the phone boots up

sudo systemctl disable nodeserver

# Find all services

sudo systemctl daemon-reload

# Enable demon

sudo systemctl enable nodeserver

# Start node server

sudo systemctl start nodeserver

# check systemctl status

sudo systemctl status nodeserver

# Start tunneling

sudo tailscale funnel --bg 3000

# Turn off funneling

tailscale funnel --https=443 off

# check funnel status

tailscale funnel status
