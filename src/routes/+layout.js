export const ssr = false;

/** @type {import('@sveltejs/kit').LayoutLoad} */
export function load({ url }) {
  return {
    url: url.pathname
  };
}