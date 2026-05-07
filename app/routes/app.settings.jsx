import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { useState, useEffect, useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const NAMESPACE = "cart_drawer";
const KEY = "settings";

const DEFAULTS = {
  drawerPosition: "right",
  primaryColor: "#111111",
  backgroundColor: "#ffffff",
  textColor: "#111111",
  announcementText: "",
  enableProgressBar: true,
  tier1Threshold: 50,
  tier1Label: "Free Shipping",
  tier2Enabled: false,
  tier2Threshold: 100,
  tier2Label: "Free Gift",
  tier3Enabled: false,
  tier3Threshold: 150,
  tier3Label: "10% Discount",
  tier4Enabled: false,
  tier4Threshold: 200,
  tier4Label: "20% Discount",
  enableUpsell: true,
  enableGiftWrap: false,
  giftWrapVariantId: "",
  giftWrapLabel: "Add gift wrap",
  giftWrapPriceLabel: "FREE",
  enableDeliveryDate: false,
  deliveryDateLabel: "Choose delivery date",
  deliveryDateMinDays: 1,
  deliveryDateMaxDays: 30,
  enableOrderNote: false,
  noteLabel: "Add a handwritten note",
  notePlaceholder: "Write your personal message here...",
  enableDiscount: true,
  availableDiscounts: "",
  enableDeliveryTimeline: true,
  timelineFulfillMin: 4,
  timelineFulfillMax: 5,
  timelineDeliveryMin: 10,
  timelineDeliveryMax: 11,
};

// ─── Server ────────────────────────────────────────────────────────────────

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
  return { settings: raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS } };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const fd = await request.formData();

  const get  = (k)       => fd.get(k);
  const bool = (k)       => get(k) === "true";
  const num  = (k, def)  => { const v = parseFloat(get(k)); return isNaN(v) ? def : v; };

  const settings = {
    drawerPosition:      get("drawerPosition")    || "right",
    primaryColor:        get("primaryColor")       || "#111111",
    backgroundColor:     get("backgroundColor")    || "#ffffff",
    textColor:           get("textColor")          || "#111111",
    announcementText:    get("announcementText")   || "",
    enableProgressBar:   bool("enableProgressBar"),
    tier1Threshold:      num("tier1Threshold", 50),
    tier1Label:          get("tier1Label")         || "Free Shipping",
    tier2Enabled:        bool("tier2Enabled"),
    tier2Threshold:      num("tier2Threshold", 100),
    tier2Label:          get("tier2Label")         || "Free Gift",
    tier3Enabled:        bool("tier3Enabled"),
    tier3Threshold:      num("tier3Threshold", 150),
    tier3Label:          get("tier3Label")         || "10% Discount",
    enableUpsell:        bool("enableUpsell"),
    enableGiftWrap:      bool("enableGiftWrap"),
    giftWrapVariantId:   get("giftWrapVariantId")  || "",
    giftWrapLabel:       get("giftWrapLabel")      || "Add gift wrap",
    giftWrapPriceLabel:  get("giftWrapPriceLabel") || "FREE",
    enableDeliveryDate:  bool("enableDeliveryDate"),
    deliveryDateLabel:   get("deliveryDateLabel")  || "Choose delivery date",
    deliveryDateMinDays: num("deliveryDateMinDays", 1),
    deliveryDateMaxDays: num("deliveryDateMaxDays", 30),
    enableOrderNote:     bool("enableOrderNote"),
    noteLabel:           get("noteLabel")          || "Add a handwritten note",
    notePlaceholder:     get("notePlaceholder")    || "Write your personal message here...",
    enableDiscount:         bool("enableDiscount"),
    availableDiscounts:     get("availableDiscounts") || "",
    tier4Enabled:           bool("tier4Enabled"),
    tier4Threshold:         num("tier4Threshold", 200),
    tier4Label:             get("tier4Label")           || "20% Discount",
    enableDeliveryTimeline: bool("enableDeliveryTimeline"),
    timelineFulfillMin:     num("timelineFulfillMin", 4),
    timelineFulfillMax:     num("timelineFulfillMax", 5),
    timelineDeliveryMin:    num("timelineDeliveryMin", 10),
    timelineDeliveryMax:    num("timelineDeliveryMax", 11),
  };

  const shopRes = await admin.graphql(`
    #graphql
    query { shop { id } }
  `);
  const { data: sd } = await shopRes.json();

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
          value: JSON.stringify(settings),
        }],
      },
    }
  );

  const { data: mfData } = await mfRes.json();
  const errors = mfData?.metafieldsSet?.userErrors || [];
  if (errors.length) return { success: false, errors };
  return { success: true, settings };
};

// ─── Shared input styles ────────────────────────────────────────────────────

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #c9cccf",
  borderRadius: 6,
  fontSize: 14,
  color: "#202223",
  background: "#fff",
  boxSizing: "border-box",
  outline: "none",
  fontFamily: "inherit",
};

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "#202223",
  marginBottom: 4,
};

const helpStyle = {
  fontSize: 12,
  color: "#6d7175",
  marginTop: 4,
};

// ─── Reusable input components (standard HTML — always work with forms) ────

function Label({ children, htmlFor }) {
  return <label htmlFor={htmlFor} style={labelStyle}>{children}</label>;
}

function TextField({ id, label, helpText, ...props }) {
  return (
    <div style={{ marginBottom: 2 }}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <input id={id} style={inputStyle} {...props} />
      {helpText && <p style={helpStyle}>{helpText}</p>}
    </div>
  );
}

function SelectField({ id, label, helpText, children, ...props }) {
  return (
    <div style={{ marginBottom: 2 }}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <select id={id} style={{ ...inputStyle, cursor: "pointer" }} {...props}>
        {children}
      </select>
      {helpText && <p style={helpStyle}>{helpText}</p>}
    </div>
  );
}

function ColorField({ id, label, ...props }) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}
      <input
        id={id}
        type="color"
        style={{ width: 48, height: 36, border: "1px solid #c9cccf", borderRadius: 4, cursor: "pointer", padding: 2, background: "#fff" }}
        {...props}
      />
    </div>
  );
}

function SectionCard({ heading, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e1e3e5", borderRadius: 8, padding: "20px 24px", marginBottom: 16 }}>
      {heading && <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px", color: "#202223" }}>{heading}</h2>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>;
}

function Divider() {
  return <hr style={{ border: "none", borderTop: "1px solid #e1e3e5", margin: "4px 0" }} />;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [v, setV] = useState({ ...settings });
  const isSaving = fetcher.state !== "idle";

  // Sync state if loader refreshes with new saved values
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.settings) {
      setV({ ...DEFAULTS, ...fetcher.data.settings });
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (fetcher.data?.success) shopify.toast.show("Settings saved!");
    if (fetcher.data?.errors?.length) shopify.toast.show("Error saving settings", { isError: true });
  }, [fetcher.data, shopify]);

  const set = useCallback((key, transform = x => x) => (e) => {
    setV(prev => ({ ...prev, [key]: transform(e.target.value) }));
  }, []);

  const handleSave = () => {
    const fd = new FormData();
    Object.entries(v).forEach(([k, val]) => fd.append(k, String(val)));
    fetcher.submit(fd, { method: "POST" });
  };

  return (
    <s-page heading="Cart Drawer Settings">

      {/* ── Appearance ── */}
      <SectionCard heading="Appearance">
        <SelectField id="drawerPosition" label="Drawer position" value={v.drawerPosition} onChange={set("drawerPosition")}>
          <option value="right">Right</option>
          <option value="left">Left</option>
        </SelectField>
        <Divider />
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <ColorField id="primaryColor"    label="Primary / button color" value={v.primaryColor}    onChange={set("primaryColor")} />
          <ColorField id="backgroundColor" label="Background"             value={v.backgroundColor} onChange={set("backgroundColor")} />
          <ColorField id="textColor"       label="Text color"             value={v.textColor}       onChange={set("textColor")} />
        </div>
        <TextField
          id="announcementText"
          label="Announcement bar text"
          value={v.announcementText}
          placeholder="Free gift on orders over $75!"
          helpText="Leave blank to hide the bar"
          onChange={set("announcementText")}
        />
      </SectionCard>

      {/* ── Progress Bar ── */}
      <SectionCard heading="Progress Bar">
        <SelectField id="enableProgressBar" label="Enable progress bar" value={String(v.enableProgressBar)} onChange={set("enableProgressBar")}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </SelectField>
        <Row>
          <TextField id="tier1Threshold" label="Tier 1 — threshold ($)" type="number" min="0" value={v.tier1Threshold} onChange={set("tier1Threshold", Number)} />
          <TextField id="tier1Label"     label="Tier 1 — reward label"  value={v.tier1Label}     placeholder="Free Shipping" onChange={set("tier1Label")} />
        </Row>
        <SelectField id="tier2Enabled" label="Enable tier 2" value={String(v.tier2Enabled)} onChange={set("tier2Enabled")}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </SelectField>
        <Row>
          <TextField id="tier2Threshold" label="Tier 2 — threshold ($)" type="number" min="0" value={v.tier2Threshold} onChange={set("tier2Threshold", Number)} />
          <TextField id="tier2Label"     label="Tier 2 — reward label"  value={v.tier2Label}     placeholder="Free Gift" onChange={set("tier2Label")} />
        </Row>
        <SelectField id="tier3Enabled" label="Enable tier 3" value={String(v.tier3Enabled)} onChange={set("tier3Enabled")}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </SelectField>
        <Row>
          <TextField id="tier3Threshold" label="Tier 3 — threshold ($)" type="number" min="0" value={v.tier3Threshold} onChange={set("tier3Threshold", Number)} />
          <TextField id="tier3Label"     label="Tier 3 — reward label"  value={v.tier3Label}     placeholder="10% Discount" onChange={set("tier3Label")} />
        </Row>
        <SelectField id="tier4Enabled" label="Enable tier 4" value={String(v.tier4Enabled)} onChange={set("tier4Enabled")}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </SelectField>
        <Row>
          <TextField id="tier4Threshold" label="Tier 4 — threshold ($)" type="number" min="0" value={v.tier4Threshold} onChange={set("tier4Threshold", Number)} />
          <TextField id="tier4Label"     label="Tier 4 — reward label"  value={v.tier4Label}     placeholder="20% Discount" onChange={set("tier4Label")} />
        </Row>
      </SectionCard>

      {/* ── Upsell ── */}
      <SectionCard heading="Upsell Recommendations">
        <SelectField id="enableUpsell" label="Show product recommendations inside drawer" value={String(v.enableUpsell)} onChange={set("enableUpsell")}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </SelectField>
        <p style={helpStyle}>
          Pick which products show as recommendations on the{" "}
          <a href="/app/upsell" style={{ color: "#2c6ecb" }}>Upsell page</a>.
        </p>
      </SectionCard>

      {/* ── Gift Wrap ── */}
      <SectionCard heading="Gift Wrap">
        <SelectField id="enableGiftWrap" label="Show gift wrap toggle in drawer" value={String(v.enableGiftWrap)} onChange={set("enableGiftWrap")}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </SelectField>
        <TextField
          id="giftWrapVariantId"
          label="Gift wrap product variant ID"
          value={v.giftWrapVariantId}
          placeholder="12345678901234"
          helpText="Numeric Shopify variant ID. Find it in Admin → Products → variant URL."
          onChange={set("giftWrapVariantId")}
        />
        <Row>
          <TextField id="giftWrapLabel"      label="Toggle label"              value={v.giftWrapLabel}      placeholder="Add gift wrap" onChange={set("giftWrapLabel")} />
          <TextField id="giftWrapPriceLabel" label="Price label (display only)" value={v.giftWrapPriceLabel} placeholder="FREE"          onChange={set("giftWrapPriceLabel")} helpText="+$5 or FREE" />
        </Row>
      </SectionCard>

      {/* ── Delivery Date ── */}
      <SectionCard heading="Delivery Date Picker">
        <SelectField id="enableDeliveryDate" label="Show delivery date picker" value={String(v.enableDeliveryDate)} onChange={set("enableDeliveryDate")}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </SelectField>
        <TextField id="deliveryDateLabel" label="Label" value={v.deliveryDateLabel} placeholder="Choose delivery date" onChange={set("deliveryDateLabel")} />
        <Row>
          <TextField id="deliveryDateMinDays" label="Min days ahead" type="number" min="0" value={v.deliveryDateMinDays} helpText="Earliest selectable date" onChange={set("deliveryDateMinDays", Number)} />
          <TextField id="deliveryDateMaxDays" label="Max days ahead" type="number" min="1" value={v.deliveryDateMaxDays} helpText="Latest selectable date"    onChange={set("deliveryDateMaxDays", Number)} />
        </Row>
      </SectionCard>

      {/* ── Handwritten Note ── */}
      <SectionCard heading="Handwritten Note">
        <SelectField id="enableOrderNote" label="Show note field in drawer" value={String(v.enableOrderNote)} onChange={set("enableOrderNote")}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </SelectField>
        <TextField id="noteLabel"       label="Label"            value={v.noteLabel}       placeholder="Add a handwritten note"           onChange={set("noteLabel")} />
        <TextField id="notePlaceholder" label="Placeholder text" value={v.notePlaceholder} placeholder="Write your personal message here..." onChange={set("notePlaceholder")} />
      </SectionCard>

      {/* ── Discount ── */}
      <SectionCard heading="Discount Code">
        <SelectField id="enableDiscount" label="Show discount code field" value={String(v.enableDiscount)} onChange={set("enableDiscount")}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </SelectField>
        <TextField
          id="availableDiscounts"
          label="Available discount codes"
          value={v.availableDiscounts}
          placeholder="SAVE10:10% Off,FREESHIP:Free Shipping"
          helpText="Format: CODE:Label,CODE2:Label2 — shown as clickable chips above the input"
          onChange={set("availableDiscounts")}
        />
      </SectionCard>

      {/* ── Delivery Timeline ── */}
      <SectionCard heading="Delivery Timeline">
        <SelectField id="enableDeliveryTimeline" label="Show delivery timeline in drawer" value={String(v.enableDeliveryTimeline)} onChange={set("enableDeliveryTimeline")}>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </SelectField>
        <Row>
          <TextField id="timelineFulfillMin" label="Fulfillment min days" type="number" min="0" value={v.timelineFulfillMin} onChange={set("timelineFulfillMin", Number)} />
          <TextField id="timelineFulfillMax" label="Fulfillment max days" type="number" min="0" value={v.timelineFulfillMax} onChange={set("timelineFulfillMax", Number)} />
        </Row>
        <Row>
          <TextField id="timelineDeliveryMin" label="Delivery min days" type="number" min="0" value={v.timelineDeliveryMin} onChange={set("timelineDeliveryMin", Number)} />
          <TextField id="timelineDeliveryMax" label="Delivery max days" type="number" min="0" value={v.timelineDeliveryMax} onChange={set("timelineDeliveryMax", Number)} />
        </Row>
      </SectionCard>

      {/* ── Save button ── */}
      <div style={{ paddingBottom: 32 }}>
        <s-button
          variant="primary"
          onClick={handleSave}
          {...(isSaving ? { loading: true } : {})}
        >
          {isSaving ? "Saving..." : "Save settings"}
        </s-button>
      </div>

    </s-page>
  );
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers = h => boundary.headers(h);
