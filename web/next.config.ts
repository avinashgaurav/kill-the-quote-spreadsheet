import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Ship the supplier documents to the one route that reads them.
   *
   * The inbox route reads a supplier's reply off disk when the buyer presses
   * send. Files under `public/` are served as static assets by the CDN and are
   * NOT otherwise present on a function's filesystem, so without this the read
   * fails in production and every supplier comes back "no response" while the
   * same code works perfectly in dev. It used to work by accident: a `join`
   * with a runtime string made the bundler give up and trace the entire
   * project, public folder included, which is also why the build warned that
   * it was including all source files as server code.
   *
   * So it is declared instead of inferred. 5 MB, to one route, on purpose.
   */
  outputFileTracingIncludes: {
    "/api/rfx/inbox": ["./public/dataset/**/*"],
  },
};

export default nextConfig;
