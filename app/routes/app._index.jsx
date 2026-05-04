import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError, useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect } from "react";

const NAMESPACE = "cart_drawer";
const KEY = "settings";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(`
    #graphql
    query {
      shop {
        metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value }
      }
    }
  `);
  const { data } = await res.json();
  const raw = data?.shop?.metafield?.value;
  const settings = raw ? JSON.parse(raw) : {};
  return {
    enableProgressBar: settings.enableProgressBar !== false,
    tier1Threshold: settings.tier1Threshold ?? 50,
    tier1Label: settings.tier1Label ?? "Free Shipping",
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "toggleProgressBar") {
    // Read current full settings so we only change one field
    const res = await admin.graphql(`
      #graphql
      query {
        shop {
          id
          metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value }
        }
      }
    `);
    const { data } = await res.json();
    const raw = data?.shop?.metafield?.value;
    const current = raw ? JSON.parse(raw) : {};
    const updated = { ...current, enableProgressBar: fd.get("enableProgressBar") === "true" };

    await admin.graphql(
      `#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [{
            ownerId: data.shop.id,
            namespace: NAMESPACE,
            key: KEY,
            type: "json",
            value: JSON.stringify(updated),
          }],
        },
      }
    );
    return { success: true, enableProgressBar: updated.enableProgressBar };
  }

  return null;
};

// ─── Toggle switch component ────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: 48,
        height: 28,
        borderRadius: 99,
        border: "none",
        background: checked ? "#008060" : "#c9cccf",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s",
        padding: 0,
        flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: "absolute",
        left: checked ? 22 : 2,
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        transition: "left 0.2s",
      }} />
    </button>
  );
}

// ─── Feature card ────────────────────────────────────────────────────────────

function FeatureCard({ label, description, checked, onToggle, disabled, badge }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 16px",
      background: "#fff",
      border: "1px solid #e1e3e5",
      borderRadius: 8,
      gap: 16,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#202223" }}>{label}</span>
          {badge && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 99,
              background: checked ? "#e3f1df" : "#f1f1f1",
              color: checked ? "#008060" : "#6d7175",
            }}>
              {checked ? "ON" : "OFF"}
            </span>
          )}
        </div>
        {description && <p style={{ fontSize: 12, color: "#6d7175", margin: 0 }}>{description}</p>}
      </div>
      <ToggleSwitch checked={checked} onChange={onToggle} disabled={disabled} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Index() {
  const { enableProgressBar, tier1Threshold, tier1Label } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const isSaving = fetcher.state !== "idle";
  const currentEnabled = fetcher.data?.enableProgressBar !== undefined
    ? fetcher.data.enableProgressBar
    : enableProgressBar;

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(
        fetcher.data.enableProgressBar ? "Shipping bar enabled" : "Shipping bar disabled"
      );
    }
  }, [fetcher.data, shopify]);

  const handleToggle = () => {
    const fd = new FormData();
    fd.append("intent", "toggleProgressBar");
    fd.append("enableProgressBar", String(!currentEnabled));
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <s-page heading="Cart Drawer">

      {/* ── Quick Controls ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          <FeatureCard
            label="Shipping Progress Bar"
            description={
              currentEnabled
                ? `Showing: spend $${tier1Threshold} for ${tier1Label}`
                : "Customers won't see the progress bar"
            }
            checked={currentEnabled}
            onToggle={handleToggle}
            disabled={isSaving}
            badge
          />

        </div>
        <p style={{ fontSize: 12, color: "#6d7175", marginTop: 8 }}>
          Configure thresholds and tiers in <a href="/app/settings" style={{ color: "#2c6ecb" }}>Settings</a>.
        </p>
      </div>

      {/* ── Setup Checklist ── */}
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
