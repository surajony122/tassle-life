import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="Cart Drawer">
      <s-section heading="Welcome to Cart Drawer">
        <s-paragraph>
          Your cart drawer app is installed! Use the navigation above to configure
          your drawer and set up upsell products.
        </s-paragraph>
      </s-section>

      <s-section heading="Setup Checklist">
        <s-list>
          <s-list-item>
            <s-text>
              1. Go to <s-link href="/app/settings">Settings</s-link> to customize colors, position, and free shipping bar.
            </s-text>
          </s-list-item>
          <s-list-item>
            <s-text>
              2. Go to <s-link href="/app/upsell">Upsell</s-link> to choose which products show as recommendations inside the drawer.
            </s-text>
          </s-list-item>
          <s-list-item>
            <s-text>
              3. In your Shopify admin, go to <s-text emphasis>Online Store → Themes → Customize</s-text>, then add the <s-text emphasis>Cart Drawer</s-text> block to your theme under App Blocks → body.
            </s-text>
          </s-list-item>
        </s-list>
      </s-section>

      <s-section heading="How it works" slot="aside">
        <s-paragraph>
          The cart drawer slides in when a customer adds a product or clicks the cart icon.
          It shows their items, a free shipping progress bar, upsell recommendations, and
          a direct checkout button — all without leaving the page.
        </s-paragraph>
      </s-section>

      <s-section heading="Features" slot="aside">
        <s-list>
          <s-list-item>Slide-in drawer (left or right)</s-list-item>
          <s-list-item>Free shipping progress bar</s-list-item>
          <s-list-item>Quantity update &amp; remove</s-list-item>
          <s-list-item>Upsell recommendations</s-list-item>
          <s-list-item>Direct checkout button</s-list-item>
          <s-list-item>Works with any theme</s-list-item>
        </s-list>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
