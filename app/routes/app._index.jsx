import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError, useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";

const NAMESPACE = "cart_drawer";
const KEY = "settings";

const VALID_TOGGLES = [
  "enableProgressBar", "enableUpsell", "enableGiftWrap",
  "enableDeliveryDate", "enableOrderNote", "enableDiscount", "enableDeliveryTimeline",
];

// ─── Server ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(`
    #graphql
    query { shop { metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value } } }
  `);
  const { data } = await res.json();
  const s = data?.shop?.metafield?.value ? JSON.parse(data.shop.metafield.value) : {};
  return {
    enableProgressBar:    s.enableProgressBar    !== false,
    enableUpsell:         s.enableUpsell         !== false,
    enableGiftWrap:       s.enableGiftWrap        === true,
    enableDeliveryDate:   s.enableDeliveryDate    === true,
    enableOrderNote:      s.enableOrderNote       === true,
    enableDiscount:       s.enableDiscount        !== false,
    enableDeliveryTimeline: s.enableDeliveryTimeline !== false,
    tier1Threshold:  s.tier1Threshold  ?? 50,
    tier1Label:      s.tier1Label      ?? "Free Shipping",
    giftWrapVariantId: s.giftWrapVariantId ?? "",
    availableDiscounts: s.availableDiscounts ?? "",
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const fd = await request.formData();
  const key   = fd.get("key");
  const value = fd.get("value") === "true";

  if (!VALID_TOGGLES.includes(key)) return { success: false };

  const shopRes = await admin.graphql(`
    #graphql
    query { shop { id metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value } } }
  `);
  const { data } = await shopRes.json();
  const current = data?.shop?.metafield?.value ? JSON.parse(data.shop.metafield.value) : {};
  const updated = { ...current, [key]: value };

  await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } }
    }`,
    { variables: { metafields: [{ ownerId: data.shop.id, namespace: NAMESPACE, key: KEY, type: "json", value: JSON.stringify(updated) }] } }
  );

  return { success: true, key, value };
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const card = {
  background: "#fff", border: "1px solid #e1e3e5", borderRadius: 8,
  padding: "16px 20px", marginBottom: 10,
};
const helpStyle = { fontSize: 12, color: "#6d7175", margin: "4px 0 0", lineHeight: 1.5 };
const noteStyle = {
  fontSize: 12, color: "#8a6800", background: "#fff8e0", border: "1px solid #f0d060",
  borderRadius: 6, padding: "7px 10px", marginTop: 8, lineHeight: 1.5,
};
const stepStyle = {
  fontSize: 12, color: "#004099", background: "#e8f0fe", border: "1px solid #bed3ff",
  borderRadius: 6, padding: "7px 10px", marginTop: 8, lineHeight: 1.5,
};

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      role="switch" aria-checked={checked} onClick={onChange} disabled={disabled}
      style={{
        position: "relative", display: "inline-flex", alignItems: "center",
        width: 44, height: 26, borderRadius: 99, border: "none", padding: 0, flexShrink: 0,
        background: checked ? "#008060" : "#c9cccf",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: "absolute", left: checked ? 20 : 2, width: 22, height: 22,
        borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)",
        transition: "left 0.2s",
      }} />
    </button>
  );
}

// ─── Feature Card ─────────────────────────────────────────────────────────────

function FeatureCard({ icon, label, statusLine, setupNote, setupStep, checked, onToggle, saving }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: checked ? "#e3f1df" : "#f1f1f1",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0, transition: "background 0.2s",
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#202223" }}>{label}</span>
              <span style={{
                marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 7px",
                borderRadius: 99, background: checked ? "#e3f1df" : "#f1f1f1",
                color: checked ? "#008060" : "#6d7175",
              }}>
                {checked ? "ON" : "OFF"}
              </span>
            </div>
            <Toggle checked={checked} onChange={onToggle} disabled={saving} />
          </div>
          {statusLine && <p style={helpStyle}>{statusLine}</p>}
          {!checked && setupNote && <p style={noteStyle}>⚠️ {setupNote}</p>}
          {checked && setupStep && <p style={stepStyle}>💡 {setupStep}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Index() {
  const loaded = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  // Optimistic local state — merge server data with pending optimistic toggles
  const [state, setState] = useState({ ...loaded });
  const saving = fetcher.state !== "idle";

  useEffect(() => { setState({ ...loaded }); }, [loaded]);

  useEffect(() => {
    if (fetcher.data?.success) {
      setState(prev => ({ ...prev, [fetcher.data.key]: fetcher.data.value }));
      shopify.toast.show(fetcher.data.value ? "Feature enabled" : "Feature disabled");
    }
  }, [fetcher.data, shopify]);

  const toggle = (key, label) => () => {
    const next = !state[key];
    setState(prev => ({ ...prev, [key]: next }));
    const fd = new FormData();
    fd.append("key", key);
    fd.append("value", String(next));
    fetcher.submit(fd, { method: "POST" });
  };

  const features = [
    {
      key: "enableProgressBar", icon: "🎯",
      label: "Progress Bar",
      statusLine: state.enableProgressBar
        ? `Spend $${state.tier1Threshold} for ${state.tier1Label}`
        : "Customers won't see the spending progress bar.",
      setupStep: "Configure tiers and thresholds in Settings → Progress Bar.",
      setupNote: "Enable to show a free shipping / reward progress bar at the top of the cart drawer.",
    },
    {
      key: "enableUpsell", icon: "✨",
      label: "Upsell Recommendations",
      statusLine: "Shows product recommendations inside the drawer.",
      setupStep: "Choose AI, manual, or collection mode on the Upsell page.",
      setupNote: "Enable then go to the Upsell page to pick which products to recommend.",
    },
    {
      key: "enableDiscount", icon: "🏷️",
      label: "Discount Codes",
      statusLine: state.availableDiscounts
        ? `Preset codes: ${state.availableDiscounts.split(",").length} configured`
        : "Shoppers can type a code manually.",
      setupStep: "Add preset codes in Settings → Discount Code (format: CODE:Label). Savings % auto-detected from labels like \"10% Off\".",
      setupNote: "Enable to show a discount code field inside the cart drawer.",
    },
    {
      key: "enableDeliveryTimeline", icon: "🚚",
      label: "Delivery Timeline",
      statusLine: "Shows Order Received → Fulfilled → Delivered dates.",
      setupStep: "Set default dates in Settings → Delivery Timeline. For per-collection overrides, use the Delivery Rules page.",
      setupNote: "Enable to show the 3-step shipping timeline at the bottom of the cart.",
    },
    {
      key: "enableGiftWrap", icon: "🎁",
      label: "Gift Wrap",
      statusLine: state.giftWrapVariantId
        ? `Variant ID: ${state.giftWrapVariantId}`
        : "No variant ID set yet.",
      setupNote: "Enable requires a variant ID. Go to Settings → Gift Wrap, then enter your gift wrap product's variant ID (found in Admin → Products → variant URL).",
      setupStep: state.giftWrapVariantId
        ? "Gift wrap option is live in the drawer."
        : "Go to Settings → Gift Wrap and enter your gift wrap variant ID.",
    },
    {
      key: "enableDeliveryDate", icon: "📅",
      label: "Delivery Date Picker",
      statusLine: "Lets shoppers choose their preferred delivery date.",
      setupStep: "Adjust min/max selectable days in Settings → Delivery Date Picker.",
      setupNote: "Enable to show a date picker so shoppers can request a delivery date.",
    },
    {
      key: "enableOrderNote", icon: "✏️",
      label: "Handwritten Note",
      statusLine: "Lets shoppers add a personal message to their order.",
      setupStep: "Customize the label and placeholder text in Settings → Handwritten Note.",
      setupNote: "Enable to show a text field where shoppers can write a personal message.",
    },
  ];

  return (
    <s-page heading="Cart Drawer — Dashboard">

      {/* ── Installation Banner ── */}
      <div style={{ background: "#f4f6f8", border: "1px solid #e1e3e5", borderRadius: 8, padding: "14px 18px", marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#202223", marginBottom: 4 }}>
          Step 1 — Install the block in your theme
        </p>
        <p style={{ margin: 0, fontSize: 12, color: "#6d7175", lineHeight: 1.6 }}>
          Go to <strong>Online Store → Themes → Customize</strong>, click <strong>Add section</strong> or <strong>App embeds</strong>,
          find <strong>Cart Drawer</strong> and enable it. The drawer will then appear on your storefront.
        </p>
      </div>

      {/* ── Feature Toggles ── */}
      <div style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#202223", margin: "0 0 10px" }}>
          Feature Quick Controls
        </p>
        {features.map(f => (
          <FeatureCard
            key={f.key}
            icon={f.icon}
            label={f.label}
            statusLine={f.statusLine}
            setupNote={f.setupNote}
            setupStep={f.setupStep}
            checked={state[f.key]}
            onToggle={toggle(f.key, f.label)}
            saving={saving}
          />
        ))}
      </div>

      {/* ── Quick Links ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { href: "/app/settings",  label: "Settings",       desc: "Colors, position, tiers, labels" },
          { href: "/app/upsell",    label: "Upsell",         desc: "AI / manual / collection mode" },
          { href: "/app/delivery",  label: "Delivery Rules", desc: "Per-collection date windows" },
        ].map(l => (
          <a key={l.href} href={l.href} style={{
            display: "block", background: "#fff", border: "1px solid #e1e3e5", borderRadius: 8,
            padding: "12px 16px", textDecoration: "none",
          }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#2c6ecb" }}>{l.label} →</p>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#6d7175" }}>{l.desc}</p>
          </a>
        ))}
      </div>

    </s-page>
  );
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers = h => boundary.headers(h);
