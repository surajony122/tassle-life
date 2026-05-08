import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const NAMESPACE = "cart_drawer";
const KEY = "settings";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const res = await admin.graphql(`
    #graphql
    query getSettings {
      shop {
        metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value }
      }
    }
  `);
  const { data } = await res.json();
  const raw = data?.shop?.metafield?.value;
  const settings = raw ? JSON.parse(raw) : {};
  
  return { 
    coupons: settings.coupons || [
      { code: "FAB10", type: "percentage", value: 10, minThreshold: 1499 },
      { code: "FAB5",  type: "percentage", value: 5,  minThreshold: 999 },
      { code: "FAB15", type: "percentage", value: 15, minThreshold: 3999 }
    ]
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const fd = await request.formData();
  
  const coupons = JSON.parse(fd.get("coupons"));

  const shopRes = await admin.graphql(`
    #graphql
    query { shop { id metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value } } }
  `);
  const { data: sd } = await shopRes.json();
  const currentSettings = sd?.shop?.metafield?.value ? JSON.parse(sd.shop.metafield.value) : {};
  
  // Merge coupons into existing settings
  currentSettings.coupons = coupons;

  const mfRes = await admin.graphql(
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
          ownerId: sd.shop.id,
          namespace: NAMESPACE,
          key: KEY,
          type: "json",
          value: JSON.stringify(currentSettings),
        }],
      },
    }
  );

  const { data: mfData } = await mfRes.json();
  const errors = mfData?.metafieldsSet?.userErrors || [];
  if (errors.length) return { success: false, errors };
  return { success: true, coupons };
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", padding: "8px 10px", border: "1px solid #c9cccf",
  borderRadius: 6, fontSize: 14, color: "#202223", background: "#fff",
  boxSizing: "border-box", outline: "none", fontFamily: "inherit",
};

const labelStyle = {
  display: "block", fontSize: 13, fontWeight: 500, color: "#202223", marginBottom: 4,
};

function TextField({ label, ...props }) {
  return (
    <div style={{ flex: 1 }}>
      {label && <label style={labelStyle}>{label}</label>}
      <input style={inputStyle} {...props} />
    </div>
  );
}

function SelectField({ label, children, ...props }) {
  return (
    <div style={{ flex: 1 }}>
      {label && <label style={labelStyle}>{label}</label>}
      <select style={{ ...inputStyle, cursor: "pointer" }} {...props}>
        {children}
      </select>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CouponsPage() {
  const { coupons: initialCoupons } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [coupons, setCoupons] = useState(initialCoupons);
  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.coupons) {
      setCoupons(fetcher.data.coupons);
      shopify.toast.show("Coupons saved!");
    }
    if (fetcher.data?.errors?.length) {
      shopify.toast.show("Error saving coupons", { isError: true });
    }
  }, [fetcher.data, shopify]);

  const updateCoupon = (index, field, value) => {
    const newCoupons = [...coupons];
    if (field === "value" || field === "minThreshold") {
      newCoupons[index][field] = parseFloat(value) || 0;
    } else {
      newCoupons[index][field] = value;
    }
    setCoupons(newCoupons);
  };

  const removeCoupon = (index) => {
    setCoupons(coupons.filter((_, i) => i !== index));
  };

  const addCoupon = () => {
    setCoupons([...coupons, { code: "", type: "percentage", value: 10, minThreshold: 1000 }]);
  };

  const handleSave = () => {
    const fd = new FormData();
    // Filter out empty codes and auto-sort by threshold descending (highest first)
    const cleanCoupons = coupons
      .filter(c => c.code.trim() !== "")
      .sort((a, b) => Number(b.minThreshold) - Number(a.minThreshold));
      
    // Update local state to reflect sorted order immediately
    setCoupons(cleanCoupons);
    
    fd.append("coupons", JSON.stringify(cleanCoupons));
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 20px" }}>
      <ui-title-bar title="Manage Coupons" />

      <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: 8, padding: "20px 24px", marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px", color: "#202223" }}>
          Dynamic Cart Coupons
        </h2>
        <p style={{ fontSize: 13, color: "#6d7175", marginBottom: 20 }}>
          These coupons will automatically appear in the Cart Drawer based on the user's cart subtotal. 
          If a user doesn't meet the threshold, they will see a "Add $X more to avail this offer" message.
          <br/><strong>Note:</strong> Coupons are automatically sorted by highest threshold first when saving.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {coupons.map((c, idx) => (
            <div key={idx} style={{ 
              display: "flex", gap: 12, alignItems: "flex-end", 
              padding: "16px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 
            }}>
              <TextField 
                label="Coupon Code" 
                value={c.code} 
                placeholder="e.g. SAVE10"
                onChange={(e) => updateCoupon(idx, "code", e.target.value)} 
              />
              <SelectField 
                label="Discount Type"
                value={c.type}
                onChange={(e) => updateCoupon(idx, "type", e.target.value)}
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </SelectField>
              <TextField 
                label={c.type === "percentage" ? "Discount Value (%)" : "Discount Value ($)"}
                type="number" 
                min="0"
                value={c.value} 
                onChange={(e) => updateCoupon(idx, "value", e.target.value)} 
              />
              <TextField 
                label="Min Spend Threshold ($)" 
                type="number" 
                min="0"
                value={c.minThreshold} 
                onChange={(e) => updateCoupon(idx, "minThreshold", e.target.value)} 
              />
              <button 
                onClick={() => removeCoupon(idx)}
                style={{ 
                  background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", 
                  borderRadius: 6, padding: "8px 12px", height: 38, cursor: "pointer", flexShrink: 0 
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button 
          onClick={addCoupon}
          style={{ 
            marginTop: 16, background: "#fff", color: "#202223", border: "1px solid #c9cccf", 
            borderRadius: 4, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" 
          }}
        >
          + Add another coupon
        </button>
      </div>

      <div style={{ paddingBottom: 32, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            background: "#000", color: "#fff", border: "none", borderRadius: 4, padding: "8px 16px",
            fontSize: 13, fontWeight: 600, cursor: isSaving ? "not-allowed" : "pointer",
            opacity: isSaving ? 0.7 : 1
          }}
        >
          {isSaving ? "Saving..." : "Save Coupons"}
        </button>
      </div>

    </div>
  );
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers = h => boundary.headers(h);
