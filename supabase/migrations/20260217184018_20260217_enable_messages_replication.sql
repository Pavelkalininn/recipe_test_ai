/*
  # Enable Replication for Messages Table

  1. Changes
    - Enable PostgreSQL replication for messages table
    - This allows real-time subscriptions to work via Supabase's real-time engine
    - Without replication, changes won't be broadcast to connected clients

  2. Important Notes
    - Replication must be enabled for real-time subscriptions to work
    - This is a PostgreSQL feature that broadcasts changes to LISTEN channels
    - No data is modified, only configuration changes
*/

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
