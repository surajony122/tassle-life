import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const NAMESPACE = "cart_drawer";
const KEY = "upsell_products";

// ─── Server ────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const [settingsRes, productsRes] = await Promise.all([
    admin.graphql(`
      #graphql
      query { shop { metafield(namespace: "${NAMESPACE}", key: "${KEY}") { value } } }
    `),
    admin.graphql(`
      #graphql
      query {
        products(first: 20, sortKey: TITLE) {
          edges {
            node {
              id title handle status
              featuredImage { url altText }
              variants(first: 1) { edges { node { price } } }
            }
          }
        }
      }
    `),
  ]);

  const { data: sd } = await settingsRes.json();
  const raw = sd?.shop?.metafield?.value;
  let saved;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    // Handle legacy format where we saved an array of GIDs
    saved = Array.isArray(parsed) || !parsed
      ? { mode: "ai", collection: "", handles: [], showAddToCart: true }
      : { mode: "ai", collection: "", handles: [], showAddToCart: true, ...parsed };
  } catch {
    saved = { mode: "ai", collection: "", handles: [], showAddToCart: true };
  }

  const { data: pd } = await productsRes.json();
  const products = pd?.products?.edges?.map(e => e.node) || [];

  return { products, saved };
};

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const fd = await request.formData();

    const mode = fd.get("mode") || "ai";
    const collection = fd.get("collection") || "";
    const showAddToCart = fd.get("showAddToCart") === "true";
    const handles = fd.getAll("handle");

    const shopRes = await admin.graphql(`#graphql query { shop { id } }`);
    const shopJson = await shopRes.json();
    
    if (!shopJson.data?.shop?.id) {
      return { success: false, errors: [{ message: "Failed to get shop ID", details: shopJson }] };
    }
    const shopData = shopJson.data;

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
            value: JSON.stringify({ mode, collection, handles, showAddToCart }),
          }],
        },
      }
    );

    const { data } = await res.json();
    const errors = data?.metafieldsSet?.userErrors || [];
    if (errors.length) return { success: false, errors };
    return { success: true, saved: { mode, collection, handles, showAddToCart } };
  } catch (error) {
    return { success: false, errors: [{ message: error.message || "Unknown error" }] };
  }
};

// ─── UI helpers ────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", padding: "8px 10px", border: "1px solid #c9cccf",
  borderRadius: 6, fontSize: 14, color: "#202223", background: "#fff",
  boxSizing: "border-box", outline: "none", fontFamily: "inherit",
};
const labelStyle = { display: "block", fontSize: 13, fontWeight: 500, color: "#202223", marginBottom: 4 };
const helpStyle  = { fontSize: 12, color: "#6d7175", marginTop: 4, margin: "4px 0 0" };

function SectionCard({ heading, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: 8, padding: "20px 24px", marginBottom: 16 }}>
      {heading && <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px", color: "#202223" }}>{heading}</h2>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function UpsellPage() {
  const { products, saved } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [mode, setMode]             = useState(saved.mode);
  const [collection, setCollection] = useState(saved.collection);
  const [showAddToCart, setShowAddToCart] = useState(saved.showAddToCart !== false);
  const [handles, setHandles]       = useState(new Set(saved.handles));

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Upsell settings saved!");
      if (fetcher.data.saved) {
        setMode(fetcher.data.saved.mode);
        setCollection(fetcher.data.saved.collection);
        setShowAddToCart(fetcher.data.saved.showAddToCart !== false);
        setHandles(new Set(fetcher.data.saved.handles));
      }
    }
    if (fetcher.data?.errors?.length) shopify.toast.show("Error saving upsell settings", { isError: true });
  }, [fetcher.data, shopify]);

  const toggleHandle = (handle) => {
    setHandles(prev => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle); else next.add(handle);
      return next;
    });
  };

  const handleSave = () => {
    const fd = new FormData();
    fd.append("mode", mode);
    fd.append("collection", collection);
    fd.append("showAddToCart", showAddToCart);
    handles.forEach(h => fd.append("handle", h));
    fetcher.submit(fd, { method: "POST" });
  };

  const modeDescriptions = {
    ai:         "Shopify automatically picks related products based on what's already in the cart.",
    manual:     "Handpick up to 6 products to always show as recommendations.",
    collection: "Enter a collection handle — products from that collection rotate as recommendations.",
  };

  return (
    <s-page heading="Upsell Recommendations">

      <SectionCard heading="Recommendation Mode">
        <div>
          <label style={labelStyle}>Source</label>
          <select value={mode} onChange={e => setMode(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="ai">AI / Automatic</option>
            <option value="manual">Manual — pick specific products</option>
            <option value="collection">Collection</option>
          </select>
          <p style={helpStyle}>{modeDescriptions[mode]}</p>
        </div>

        {mode === "collection" && (
          <div>
            <label style={labelStyle}>Collection handle</label>
            <input
              type="text"
              value={collection}
              onChange={e => setCollection(e.target.value)}
              placeholder="e.g. best-sellers"
              style={inputStyle}
            />
            <p style={helpStyle}>
              Find it in Admin → Collections → click the collection → it's the slug after /collections/ in the URL.
            </p>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            id="showAddToCart"
            checked={showAddToCart}
            onChange={e => setShowAddToCart(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor="showAddToCart" style={{ fontSize: 14, color: "#202223", cursor: "pointer" }}>
            Show "Add to Cart" button on upsell items
          </label>
        </div>
      </SectionCard>

      {mode === "manual" && (
        <SectionCard heading={`Select Products — ${handles.size} selected`}>
          {products.length === 0 && (
            <p style={helpStyle}>No products found in your store.</p>
          )}
          {products.map(product => {
            const checked  = handles.has(product.handle);
            const price    = product.variants?.edges?.[0]?.node?.price;
            const imageUrl = product.featuredImage?.url;
            return (
              <div
                key={product.id}
                onClick={() => toggleHandle(product.handle)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px",
                  border: `1px solid ${checked ? "#2c6ecb" : "#e1e3e5"}`,
                  borderRadius: 8, cursor: "pointer",
                  background: checked ? "#f4f6f8" : "#fff",
                }}
              >
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt={product.featuredImage?.altText || product.title}
                    width={48} height={48}
                    style={{ objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: 14, color: "#202223" }}>{product.title}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6d7175" }}>
                    {price ? `$${price}` : "—"} &nbsp;·&nbsp; handle: <code>{product.handle}</code>
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {}}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 18, height: 18, flexShrink: 0 }}
                />
              </div>
            );
          })}
          {handles.size === 0 && (
            <p style={helpStyle}>Select products above. If none are selected, Shopify automatic recommendations are used as fallback.</p>
          )}
        </SectionCard>
      )}

      <div style={{ paddingBottom: 32 }}>
        <s-button
          variant="primary"
          onClick={handleSave}
          {...(isSaving ? { loading: true } : {})}
        >
          {isSaving ? "Saving..." : "Save upsell settings"}
        </s-button>
      </div>

    </s-page>
  );
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers = h => boundary.headers(h);
