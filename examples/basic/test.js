import eyeball from "./dist/eyeball.js";

const response = await eyeball.fetch(
	new Request("http://localhost:5173/api/profile"),
	{
		env: {},
		waitUntil() {},
	},
);
console.log(response.status, await response.text());
