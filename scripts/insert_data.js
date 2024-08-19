const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Read and parse the JSON files
const data1 = JSON.parse(fs.readFileSync('instagram_r2_data.json', 'utf8'));
const data2 = JSON.parse(fs.readFileSync('instagram_r2_data_2.json', 'utf8'));

// Combine the data from both files
const combinedData = [...data1, ...data2];

// Create a Set to store unique usernames
const uniqueUsernames = new Set();

// Filter out duplicate users based on username
const data = combinedData.filter(user => {
  if (uniqueUsernames.has(user.username)) {
    return false;
  }
  uniqueUsernames.add(user.username);
  return true;
});

// Function to escape special characters for SQL
function escapeSQL(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
    switch (char) {
      case "\0": return "\\0";
      case "\x08": return "\\b";
      case "\x09": return "\\t";
      case "\x1a": return "\\z";
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "'": return "''"; // Use two single quotes to escape
      case "\"":
      case "\\":
      case "%":
        return "\\" + char; // prepends a backslash to backslash, percent, and double/single quotes
    }
  });
}
// Initialize a userId counter
let userId = 1;

// Function to generate SQL commands for a batch of users and their posts
function generateBatchCommands(users, startUserId) {
  let userCommands = [];
  let postCommands = [];

  users.forEach((user, index) => {
    const currentUserId = startUserId + index;
    
    // Generate user insert command
    userCommands.push(`(${currentUserId}, '${escapeSQL(user.username)}', '${escapeSQL(user.profile_pic_url)}', '${escapeSQL(user.name)}')`);

    // Generate post insert commands
    user.posts.forEach(post => {
      const postValues = [
        escapeSQL(post.id),
        currentUserId,
        escapeSQL(post.taken_at),
        escapeSQL(post.caption_text),
        escapeSQL(post.image_url),
        post.width,
        post.height,
        post.like_count,
        post.comment_count
      ].join("', '");

      postCommands.push(`('${postValues}')`);
    });
  });

  const userSQL = `INSERT OR IGNORE INTO IG_Users (user_id, username, profile_pic_url, name) VALUES ${userCommands.join(', ')}`;
  const postSQL = `INSERT OR REPLACE INTO IG_Posts (post_id, user_id, taken_at, caption_text, image_url, width, height, like_count, comment_count) VALUES ${postCommands.join(', ')}`;

  return [userSQL, postSQL];
}

// Function to execute a batch of SQL commands
async function executeBatch(commands) {
  for (const command of commands) {
    await execPromise(`npx wrangler d1 execute athens-mock-db --remote --command="${command}"`);
  }
}

// Main function to process all users in batches
async function processAllUsers() {
  const batchSize = 10; // Adjust this value based on your needs and limitations
  for (let i = 0; i < data.length; i += batchSize) {
    const userBatch = data.slice(i, i + batchSize);
    const commands = generateBatchCommands(userBatch, userId);
    await executeBatch(commands);
    console.log(`Processed batch of users: ${i + 1} to ${Math.min(i + batchSize, data.length)}`);
    userId += batchSize;
  }
  console.log('All users processed');
}

// Run the main function
processAllUsers();