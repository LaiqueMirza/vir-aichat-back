# Database Setup Scripts

## Create Tables Script

The `create-tables.js` script is designed to automatically create the necessary database tables in your Supabase project if they don't already exist.

### Prerequisites

1. Make sure your `.env` file contains the following variables:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (preferred for database operations)
   - `SUPABASE_ANON_KEY`: Your Supabase anonymous key (used as fallback)

### How to Use

You have two options to set up the database tables:

### Option 1: Using the SQL File (Recommended)

1. Go to the Supabase dashboard and open the SQL Editor.
2. Open the `scripts/create-tables.sql` file in this project.
3. Copy all the SQL statements from this file.
4. Paste and run them in the Supabase SQL Editor.

This will create all necessary tables and the `exec_sql` function in one step.

### Option 2: Using the Node.js Script

1. Run the script using Node.js:

```bash
node scripts/create-tables.js
```

2. If the script fails (which is likely on first run), it will direct you to use the SQL file method described in Option 1.

### What the Script Does

1. Connects to your Supabase project using the provided credentials
2. Checks if the required `exec_sql` function exists in your Supabase project
   - If not, it attempts to create this function
3. Creates the following tables if they don't exist:
   - `agents`: Stores information about AI agents
   - `files`: Stores file metadata for documents uploaded to agents
   - `leads`: Stores information about leads/users interacting with agents
   - `chats`: Stores chat session information
   - `chat_logs`: Stores individual messages in chat sessions
4. Sets up Row Level Security (RLS) policies for each table

### Manual Setup

If the script encounters issues creating tables automatically, it will output the SQL statements needed to create the tables. You can copy these statements and run them directly in the Supabase SQL Editor.

### Troubleshooting

- **Connection Issues**: Verify your Supabase URL and keys in the `.env` file
- **Permission Issues**: Make sure you're using the `SUPABASE_SERVICE_ROLE_KEY` which has full database access
- **Function Creation Failure**: If the script can't create the `exec_sql` function, you'll need to manually create it using the SQL provided in the script output