import { AwsClient } from 'aws4fetch';

export interface Env {
	ATHENS_MOCK_DB: D1Database;
	R2_ACCESS_KEY_ID: string;
	R2_SECRET_ACCESS_KEY: string;
	R2_BUCKET_NAME: string;
	R2_ACCOUNT_ID: string;
}

interface IGUser {
	user_id: number;
	username: string;
	profile_pic_url: string | null;
	name: string | null;
	accessKey: string | null;
	bio: string | null;
	follower_count: number;
	following_count: number;
	posts: IGPost[];
}

interface IGPost {
	post_id: string;
	user_id: number;
	taken_at: string;
	caption_text: string | null;
	image_url: string;
	width: number;
	height: number;
	like_count: number;
	comment_count: number;
}
type ErrorOrMessage = {
	code: string;
	message: string;
};

type DirectUploadResponse = {
	result: {
		id: string;
		uploadURL: string;
	};
	success: boolean;
	errors: ErrorOrMessage[];
	messages: ErrorOrMessage[];
};

const r2Client = (env: Env) =>
	new AwsClient({
		accessKeyId: env.R2_ACCESS_KEY_ID,
		secretAccessKey: env.R2_SECRET_ACCESS_KEY,
	});

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return handleCORS();
		}

		const { pathname, searchParams } = new URL(request.url);
		const response = await handleRequest(pathname, searchParams, env, request);

		// Add CORS headers to the response
		response.headers.set('Access-Control-Allow-Origin', '*');
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

		return response;
	},
} satisfies ExportedHandler<Env>;

function handleCORS(): Response {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		},
	});
}

async function handleRequest(pathname: string, searchParams: URLSearchParams, env: Env, request: Request): Promise<Response> {
	switch (pathname) {
		case '/api/explore':
			return handleExplore(env);
		case '/api/exploreWithDelay':
			return handleExploreWithDelay(env);
		case '/api/feed':
			return handleFeed(env);
		case '/api/user':
			return handleUser(searchParams, env);
		case '/api/post':
			return handlePost(searchParams, env);
		case '/api/search':
			return handleSearch(searchParams, env);
		case '/api/addUser':
			return handleAddUser(request, env);
		case '/api/updateUser':
			return handleUpdateUser(request, env);
		case '/api/createPost':
			return handleCreatePost(request, env);
		case '/api/getImageUploadUrl':
			return handleGetImageUploadUrl(request, env);
		// case '/api/debug-env':
		// 	return handleDebugEnv(env);
		default:
			return handleInvalidEndpoint();
	}
}

async function handleExplore(env: Env): Promise<Response> {
	const { results } = await env.ATHENS_MOCK_DB.prepare(
		'SELECT p.*, u.username, u.profile_pic_url, u.name FROM IG_Posts p JOIN IG_Users u ON p.user_id = u.user_id ORDER BY RANDOM() LIMIT 21'
	).all();
	return Response.json(results);
}

async function handleExploreWithDelay(env: Env): Promise<Response> {
	await sleep(1000);
	const { results } = await env.ATHENS_MOCK_DB.prepare(
		'SELECT p.*, u.username, u.profile_pic_url, u.name FROM IG_Posts p JOIN IG_Users u ON p.user_id = u.user_id ORDER BY RANDOM() LIMIT 15'
	).all();
	return Response.json(results);
}

async function handleFeed(env: Env): Promise<Response> {
	const { results } = await env.ATHENS_MOCK_DB.prepare(
		'SELECT p.*, u.username, u.profile_pic_url, u.name FROM IG_Posts p JOIN IG_Users u ON p.user_id = u.user_id ORDER BY RANDOM() LIMIT 5'
	).all();
	return Response.json(results);
}

async function handleUser(searchParams: URLSearchParams, env: Env): Promise<Response> {
	const username = searchParams.get('username');
	const accessKey = searchParams.get('accessKey');
	if (!username && !accessKey) {
		return new Response('Either username or accessKey parameter is required', { status: 400 });
	}
	let query = 'SELECT u.*, p.* FROM IG_Users u LEFT JOIN IG_Posts p ON u.user_id = p.user_id WHERE ';
	let bindValue;
	if (username) {
		query += 'u.username = ?';
		bindValue = username;
	} else {
		query += 'u.accessKey = ?';
		bindValue = accessKey;
	}
	const { results } = await env.ATHENS_MOCK_DB.prepare(query).bind(bindValue).all<IGUser & IGPost>();
	if (results.length === 0) {
		return new Response('User not found', { status: 404 });
	}

	const user: Omit<IGUser, 'accessKey'> = {
		user_id: results[0].user_id,
		username: results[0].username,
		profile_pic_url: results[0].profile_pic_url,
		name: results[0].name,
		bio: results[0].bio,
		follower_count: results[0].follower_count,
		following_count: results[0].following_count,
		posts: [],
	};

	results.forEach((result) => {
		if (result.post_id) {
			user.posts.push({
				post_id: result.post_id,
				user_id: result.user_id,
				taken_at: result.taken_at,
				caption_text: result.caption_text,
				image_url: result.image_url,
				width: result.width,
				height: result.height,
				like_count: result.like_count,
				comment_count: result.comment_count,
			});
		}
	});

	return Response.json(user);
}

async function handlePost(searchParams: URLSearchParams, env: Env): Promise<Response> {
	const postId = searchParams.get('id');
	if (!postId) {
		return new Response('Post ID parameter is required', { status: 400 });
	}
	const { results } = await env.ATHENS_MOCK_DB.prepare(
		'SELECT p.*, u.username, u.profile_pic_url, u.name FROM IG_Posts p JOIN IG_Users u ON p.user_id = u.user_id WHERE p.post_id = ?'
	)
		.bind(postId)
		.all();
	if (results.length === 0) {
		return new Response('Post not found', { status: 404 });
	}
	return Response.json(results[0]);
}

async function handleSearch(searchParams: URLSearchParams, env: Env): Promise<Response> {
	const query = searchParams.get('q');
	if (!query) {
		return new Response('Search query parameter is required', { status: 400 });
	}
	const { results } = await env.ATHENS_MOCK_DB.prepare(
		'SELECT user_id, username, profile_pic_url, name FROM IG_Users WHERE username LIKE ? OR name LIKE ? ORDER BY user_id LIMIT 5'
	)
		.bind(`%${query}%`, `%${query}%`)
		.all();
	return Response.json(results);
}

async function handleAddUser(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 });
	}

	const { name, accessKey, profilePicUrl }: { name: string; accessKey: string; profilePicUrl?: string } = await request.json();

	if (!name || !accessKey) {
		return new Response('Name and accessKey are required', { status: 400 });
	}

	// Check if user already exists with the given accessKey
	const { results: existingUser } = await env.ATHENS_MOCK_DB.prepare('SELECT * FROM IG_Users WHERE accessKey = ?').bind(accessKey).all();

	if (existingUser.length > 0) {
		return new Response(JSON.stringify(existingUser[0]), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const generateUsername = (name: string): string => {
		const baseName = name.toLowerCase().replace(/\s+/g, '');
		const randomNum = Math.floor(1000 + Math.random() * 9000);
		return `${baseName}${randomNum}`;
	};

	let username = generateUsername(name);
	let isUnique = false;
	let attempts = 0;

	while (!isUnique && attempts < 10) {
		const { results } = await env.ATHENS_MOCK_DB.prepare('SELECT username FROM IG_Users WHERE username = ?').bind(username).all();

		if (results.length === 0) {
			isUnique = true;
		} else {
			username = generateUsername(name);
			attempts++;
		}
	}

	if (!isUnique) {
		return new Response('Unable to generate a unique username. Please try again.', { status: 500 });
	}

	try {
		await env.ATHENS_MOCK_DB.prepare('INSERT INTO IG_Users (username, name, accessKey, profile_pic_url) VALUES (?, ?, ?, ?)')
			.bind(username, name, accessKey, profilePicUrl || null)
			.run();

		return new Response(JSON.stringify({ username, name, accessKey, profilePicUrl }), {
			status: 201,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		return new Response('Error adding user to database', { status: 500 });
	}
}

async function handleUpdateUser(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'PUT') {
		return new Response('Method not allowed', { status: 405 });
	}

	const {
		accessKey,
		username,
		name,
		bio,
		profilePicUrl,
	}: { accessKey: string; username?: string; name?: string; bio?: string; profilePicUrl?: string } = await request.json();

	if (!accessKey) {
		return new Response('AccessKey is required', { status: 400 });
	}

	// Check if user exists
	const { results: existingUser } = await env.ATHENS_MOCK_DB.prepare('SELECT * FROM IG_Users WHERE accessKey = ?').bind(accessKey).all();

	if (existingUser.length === 0) {
		return new Response(`User not found, accessKey: ${accessKey}`, { status: 404 });
	}

	// Check if the new username is already taken (if it's different from the user's current username)
	if (username && username !== existingUser[0].username) {
		const { results: existingUsername } = await env.ATHENS_MOCK_DB.prepare('SELECT username FROM IG_Users WHERE username = ?')
			.bind(username)
			.all();
		if (existingUsername.length > 0) {
			return new Response('Username is already taken', { status: 409 });
		}
	}

	// Prepare the update query
	let updateQuery = 'UPDATE IG_Users SET';
	const updateValues = [];
	if (username !== undefined) {
		updateQuery += ' username = ?,';
		updateValues.push(username);
	}
	if (name !== undefined) {
		updateQuery += ' name = ?,';
		updateValues.push(name);
	}
	if (bio !== undefined) {
		updateQuery += ' bio = ?,';
		updateValues.push(bio);
	}
	if (profilePicUrl !== undefined) {
		updateQuery += ' profile_pic_url = ?,';
		updateValues.push(profilePicUrl);
	}

	// Remove the trailing comma if there are updates
	if (updateValues.length > 0) {
		updateQuery = updateQuery.slice(0, -1);
		updateQuery += ' WHERE accessKey = ?';
		updateValues.push(accessKey);

		try {
			await env.ATHENS_MOCK_DB.prepare(updateQuery)
				.bind(...updateValues)
				.run();
		} catch (error) {
			return new Response('Error updating user in database', { status: 500 });
		}
	}

	// Fetch the updated user data
	const { results: updatedUser } = await env.ATHENS_MOCK_DB.prepare('SELECT * FROM IG_Users WHERE accessKey = ?').bind(accessKey).all();

	return new Response(JSON.stringify(updatedUser[0]), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

async function handleCreatePost(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 });
	}

	const { accessKey, image_url, userId, takenAt }: { accessKey: string; image_url: string; userId: number; takenAt: string } =
		await request.json();

	if (!accessKey || !image_url || !userId || !takenAt) {
		return new Response('AccessKey, image_url, userId, and takenAt are required', { status: 400 });
	}

	// Check if user exists and has the correct accessKey
	const { results: existingUser } = await env.ATHENS_MOCK_DB.prepare('SELECT * FROM IG_Users WHERE user_id = ? AND accessKey = ?')
		.bind(userId, accessKey)
		.all();

	if (existingUser.length === 0) {
		return new Response('User not found or invalid accessKey', { status: 404 });
	}

	const postId = crypto.randomUUID();

	try {
		await env.ATHENS_MOCK_DB.prepare(
			'INSERT INTO IG_Posts (post_id, user_id, taken_at, image_url, width, height, like_count, comment_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		)
			.bind(postId, userId, takenAt, image_url, 0, 0, 0, 0)
			.run();

		const { results: newPost } = await env.ATHENS_MOCK_DB.prepare('SELECT * FROM IG_Posts WHERE post_id = ?').bind(postId).all();

		return new Response(JSON.stringify(newPost[0]), {
			status: 201,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		return new Response('Error creating post in database', { status: 500 });
	}
}

async function handleGetImageUploadUrl(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 });
	}

	const { accessKey, fileName } = (await request.json()) as { accessKey: string; fileName: string };

	if (!accessKey || !fileName) {
		return new Response('AccessKey and fileName are required', { status: 400 });
	}

	// Check if user exists
	const { results: existingUser } = await env.ATHENS_MOCK_DB.prepare('SELECT * FROM IG_Users WHERE accessKey = ?').bind(accessKey).all();

	if (existingUser.length === 0) {
		return new Response('User not found', { status: 404 });
	}

	try {
		const r2 = r2Client(env);
		const bucketName = env.R2_BUCKET_NAME;
		const accountId = env.R2_ACCOUNT_ID;

		const url = new URL(`https://${bucketName}.${accountId}.r2.cloudflarestorage.com`);
		url.pathname = `/${fileName}`;
		url.searchParams.set('X-Amz-Expires', '3600');

		const signed = await r2.sign(
			new Request(url, {
				method: 'PUT',
			}),
			{
				aws: { signQuery: true },
			}
		);

		return new Response(JSON.stringify({ uploadURL: signed.url }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error(error);
		return new Response('An unknown error occurred', { status: 500 });
	}
}

function handleInvalidEndpoint(): Response {
	return new Response(
		'Invalid endpoint. Available endpoints: /api/explore, /api/exploreWithDelay, /api/feed, /api/user?username=..., /api/post?id=..., /api/search?q=..., /api/addUser, /api/updateUser, /api/createPost',
		{
			status: 404,
		}
	);
}
