// Point d'entrée Vite : reprend vite.config.ts sans le modifier et ajoute les correctifs SmilePec.
import base from "./vite.config.ts";

const smilepecPatch = {
  name: "smilepec-admin-patch",
  transformIndexHtml: {
    order: "pre",
    handler: (html) => html.replace("</body>", '<script type="module" src="/smilepec-patch/admin-patch.js"></script></body>'),
  },
};

export default async (env) => {
  const config = typeof base === "function" ? await base(env) : base;
  return { ...config, plugins: [...(config.plugins || []), smilepecPatch] };
};
