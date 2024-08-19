DROP TABLE IF EXISTS IG_Posts;
DROP TABLE IF EXISTS IG_Users;

DROP TABLE IF EXISTS Posts;
DROP TABLE IF EXISTS Users;

-- Users table
CREATE TABLE IG_Users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    profile_pic_url TEXT,
    name TEXT
);

-- Add accessKey column to IG_Users table
ALTER TABLE IG_Users ADD COLUMN accessKey TEXT DEFAULT NULL UNIQUE;
ALTER TABLE IG_Users ADD COLUMN name TEXT DEFAULT NULL;
ALTER TABLE IG_Users ADD COLUMN bio TEXT DEFAULT 'bio placeholder';
ALTER TABLE IG_Users ADD COLUMN follower_count INTEGER DEFAULT 0;
ALTER TABLE IG_Users ADD COLUMN following_count INTEGER DEFAULT 0;

-- Posts table
CREATE TABLE IG_Posts (
    post_id TEXT PRIMARY KEY,
    user_id INTEGER,
    taken_at TIMESTAMP,
    caption_text TEXT NULL,
    image_url TEXT,
    width INTEGER NULL,
    height INTEGER NULL,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES IG_Users(user_id)
);

-- Create an index on the user_id column in the Posts table
CREATE INDEX idx_posts_user_id ON IG_Posts(user_id);