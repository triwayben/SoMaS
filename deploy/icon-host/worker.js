/**
 * Nothing but the app's own mark, served from a public https address.
 *
 * Unraid downloads a container's icon itself, on the server, before it knows anything about the
 * container being reachable — and a private image cannot ship a public URL, nor can a label name
 * an address the NAS has not been told. So the artwork is published here once, and the image's
 * `net.unraid.docker.icon` label points at it: adding the container is then the whole setup.
 */
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const match = /^\/(icon-[a-z0-9-]+\.png|favicon-64\.png)$/.exec(pathname);
    if (!match) {
      return new Response("SoMaS icons: /icon-plate-128.png, /icon-plate-512.png, /icon-128.png", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    const asset = await env.ASSETS.fetch(new URL(`/${match[1]}`, request.url));
    if (!asset.ok) return new Response("Not here", { status: 404 });
    // Unraid caches what it downloads, so a day is plenty and keeps repeat installs cheap.
    const headers = new Headers(asset.headers);
    headers.set("cache-control", "public, max-age=86400");
    headers.set("access-control-allow-origin", "*");
    return new Response(asset.body, { status: 200, headers });
  },
};
