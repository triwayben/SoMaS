# SoMaS guest proxy — a single Node file with no dependencies, so there is nothing to install.
FROM node:22-alpine

WORKDIR /app
COPY server.mjs ./
# The app imports this same file to word its explanation, so there is one list of rules, not two.
COPY guest-features.json ./

# MA_TOKEN is the real Music Assistant credential; GUEST_KEY is what a guest types in SoMaS.
# Neither is baked in — pass them at run time.
ENV PORT=8090
EXPOSE 8090

USER node
CMD ["node", "server.mjs"]
