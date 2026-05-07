import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const NAMESPACE = "cart_drawer";
const KEY = "delivery_rules";

const EMPTY_RULE = { collection: "", fulfillMin: 2, fulfillMax: 3, deliveryMin: 7, deliveryMax: 10 };

// ─── Server ────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(`
    #graphql
    query { shop { metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value } } }
  `);
  const { data } = await res.json();
  const raw = data?.shop?.metafield?.value;
  let saved;
  try {
    saved = raw ? JSON.parse(raw) : { rules: [], default: { fulfillMin: 4, fulfillMax: 5, deliveryMin: 10, deliveryMax: 11 } };
  } catch {
    saved = { rules: [], default: { fulfillMin: 4, fulfillMax: 5, deliveryMin: 10, deliveryMax: 11 } };
  }
  return { saved };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const fd = await request.formData();

  let payload;
  try {
    payload = JSON.parse(fd.get("payload") || "{}");
  } catch {
    return { success: false, errors: [{ message: "Invalid data" }] };
  }

  const shopRes = await admin.graphql(`#graphql query { shop { id } }`);
  const { data: shopData } = await shopRes.json();

  const res = await admin.graphql(
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
          ownerId: shopData.shop.id,
          namespace: NAMESPACE,
          key: KEY,
          type: "json",
          value: JSON.stringify(payload),
        }],
      },
    }
  );

  const { data } = await res.json();
  const errors = data?.metafieldsSet?.userErrors || [];
  if (errors.length) return { success: false, errors };
  return { success: true, saved: payload };
};

// ─── UI helpers ────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", padding: "6px 8px", border: "1px solid #c9cccf",
  borderRadius: 6, fontSize: 13, color: "#202223", background: "#fff",
  boxSizing: "border-box", outline: "none", fontFamily: "inherit",
};
const labelStyle = { display: "block", fontSize: 11, fontWeight: 500, color: "#6d7175", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" };
const helpStyle  = { fontSize: 12, color: "#6d7175", marginTop: 4 };

function NumberInput({ label, value, onChange, min = 0 }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="number" min={min} value={value} onChange={onChange} style={inputStyle} />
    </div>
  );
}

function RuleRow({ rule, index, onChange, onRemove }) {
  const set = (field) => (e) => onChange(index, { ...rule, [field]: field.includes("Min") || field.includes("Max") ? Number(e.target.value) : e.target.value });
  return (
    <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, padding: "14px 16px", background: "#fafbfb", position: "relative" }}>
      <button
        onClick={() => onRemove(index)}
        title="Remove rule"
        style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", cursor: "pointer", color: "#d72c0d", fontSize: 18, lineHeight: 1, padding: "0 4px" }}
      >
        ×
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10, alignItems: "end", paddingRight: 28 }}>
        <div>
          <label style={labelStyle}>Collection handle</label>
          <input
            type="text"
            value={rule.collection}
            onChange={set("collection")}
            placeholder="e.g. custom-orders"
            style={inputStyle}
          />
        </div>
        <NumberInput label="Fulfill min (days)" value={rule.fulfillMin}  onChange={set("fulfillMin")} />
        <NumberInput label="Fulfill max (days)" value={rule.fulfillMax}  onChange={set("fulfillMax")} />
        <NumberInput label="Delivery min"       value={rule.deliveryMin} onChange={set("deliveryMin")} />
        <NumberInput label="Delivery max"       value={rule.deliveryMax} onChange={set("deliveryMax")} />
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function DeliveryRulesPage() {
  const { saved } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [rules, setRules]     = useState(saved.rules || []);
  const [defaults, setDefaults] = useState(saved.default || { fulfillMin: 4, fulfillMax: 5, deliveryMin: 10, deliveryMax: 11 });

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Delivery rules saved!");
      if (fetcher.data.saved) {
        setRules(fetcher.data.saved.rules || []);
        setDefaults(fetcher.data.saved.default || defaults);
      }
    }
    if (fetcher.data?.errors?.length) shopify.toast.show("Error saving delivery rules", { isError: true });
  }, [fetcher.data, shopify]);

  const updateRule  = (i, updated)  => setRules(prev => prev.map((r, idx) => idx === i ? updated : r));
  const removeRule  = (i)           => setRules(prev => prev.filter((_, idx) => idx !== i));
  const addRule     = ()            => setRules(prev => [...prev, { ...EMPTY_RULE }]);
  const setDefault  = (field) => (e) => setDefaults(prev => ({ ...prev, [field]: Number(e.target.value) }));

  const handleSave = () => {
    const fd = new FormData();
    fd.append("payload", JSON.stringify({ rules, default: defaults }));
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <s-page heading="Delivery Rules">

      {/* How it works */}
      <div style={{ background: "#f0f4ff", border: "1px solid #b3c8ff", borderRadius: 8, padding: "14px 18px", marginBottom: 16, fontSize: 13, color: "#202223", lineHeight: 1.6 }}>
        <strong>How it works:</strong> When a shopper's cart contains an item from one of these collections,
        the delivery timeline in the cart drawer shows the dates for that rule.
        If no rule matches, the <em>default</em> dates below are used.
        Rules are checked in order — first match wins.
      </div>

      {/* Collection rules */}
      <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: 8, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#202223" }}>
            Collection Rules {rules.length > 0 && <span style={{ color: "#6d7175", fontWeight: 400 }}>({rules.length})</span>}
          </h2>
          <button
            onClick={addRule}
            style={{ padding: "6px 14px", background: "#fff", border: "1px solid #c9cccf", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
          >
            + Add rule
          </button>
        </div>

        {rules.length === 0 && (
          <p style={helpStyle}>No collection rules yet. Click "+ Add rule" to create one.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rules.map((rule, i) => (
            <RuleRow key={i} rule={rule} index={i} onChange={updateRule} onRemove={removeRule} />
          ))}
        </div>
      </div>

      {/* Default dates */}
      <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: 8, padding: "20px 24px", marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 14px", color: "#202223" }}>Default Dates (no rule matches)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <NumberInput label="Fulfill min (days)" value={defaults.fulfillMin}  onChange={setDefault("fulfillMin")} />
          <NumberInput label="Fulfill max (days)" value={defaults.fulfillMax}  onChange={setDefault("fulfillMax")} />
          <NumberInput label="Delivery min"       value={defaults.deliveryMin} onChange={setDefault("deliveryMin")} />
          <NumberInput label="Delivery max"       value={defaults.deliveryMax} onChange={setDefault("deliveryMax")} />
        </div>
        <p style={{ ...helpStyle, marginTop: 10 }}>
          These are the fallback dates shown when no collection rule matches.
          They also keep the Settings page in sync — both control the same timeline.
        </p>
      </div>

      <div style={{ paddingBottom: 32 }}>
        <s-button
          variant="primary"
          onClick={handleSave}
          {...(isSaving ? { loading: true } : {})}
        >
          {isSaving ? "Saving..." : "Save delivery rules"}
        </s-button>
      </div>

    </s-page>
  );
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers = h => boundary.headers(h);
