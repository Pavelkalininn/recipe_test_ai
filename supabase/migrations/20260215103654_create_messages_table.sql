/*
  # Create messages table for chat application

  1. New Tables
    - `messages`
      - `id` (uuid, primary key) - Unique message identifier
      - `user_id` (uuid, references auth.users) - Author of the message
      - `user_email` (text) - Email of the author for display
      - `content` (text) - Message content
      - `created_at` (timestamptz) - Message timestamp

  2. Security
    - Enable RLS on `messages` table
    - Add policy for authenticated users to read all messages
    - Add policy for authenticated users to insert their own messages
    - Add policy for users to delete only their own messages

  3. Indexes
    - Add index on created_at for efficient message ordering
    - Add index on user_id for user-specific queries
*/

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_email text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all messages"
  ON messages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert their own messages"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
  ON messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id);
