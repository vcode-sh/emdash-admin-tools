import type { APIContext, APIRoute } from "astro";
import type { EmDashHandlers } from "emdash/astro";

const actors = [
	{ id: "admin", name: "Admin Tools Test Admin", role: 50 },
	{ id: "editor", name: "Admin Tools Test Editor", role: 40 },
];

/** Creates identities only in the disposable localhost development host. */
export const GET = (async ({
	locals,
	params,
	session,
	url,
}: APIContext & {
	locals: { emdash?: EmDashHandlers };
}) => {
	if (!(import.meta.env.DEV && url.hostname === "127.0.0.1")) {
		return new Response("Not found", { status: 404 });
	}
	const actor = actors.find((candidate) => candidate.id === params.actor);
	if (!actor) return new Response("Unknown fixture identity", { status: 404 });
	if (!(locals.emdash?.db && session))
		throw new Error("The disposable host is unavailable.");
	const id = `admin-tools-test-${actor.id}`;
	const now = new Date().toISOString();
	await locals.emdash.db
		.insertInto("users")
		.values({
			id,
			email: `${actor.id}@admin-tools.invalid`,
			email_verified: 1,
			name: actor.name,
			role: actor.role,
			created_at: now,
			updated_at: now,
		})
		.onConflict((conflict) => conflict.column("id").doNothing())
		.execute();
	session.set("user", { id });
	return Response.json({ id, role: actor.role });
}) satisfies APIRoute;
