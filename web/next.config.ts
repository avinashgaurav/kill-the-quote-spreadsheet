import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * No dev-tools badge. It sits over the draft box.
   *
   * Next draws a floating indicator at the bottom-left in development, and in
   * this layout it lands on top of the left edge of the "What do you need to
   * buy?" input, clipping the placeholder to "...o you need to buy?". It is in
   * every screenshot of the Draft tab and would be in every frame of a
   * recording, on the first screen anybody sees.
   *
   * Development-only, so this changes nothing about the deployed site. It is
   * here because the demo is driven locally.
   */
  devIndicators: false,

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
