import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const UPSELL_NAMESPACE = "cart_drawer";
const UPSELL_KEY = "upsell_products";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Load saved upsell product IDs
  const settingsRes = await admin.graphql(`
    #graphql
    query getUpsellSettings {
      shop {
        metafield(namespace: "${UPSELL_NAMESPACE}", key: "${UPSELL_KEY}") {
          value
        }
      }
    }
  `);
  const { data: settingsData } = await settingsRes.json();
  const savedIds = settingsData?.shop?.metafield?.value
    ? JSON.parse(settingsData.shop.metafield.value)
    : [];

  // Load first 20 products for the picker
  const productsRes = await admin.graphql(`
    #graphql
    query getProducts {
      products(first: 20, sortKey: TITLE) {
        edges {
          node {
            id
            title
            handle
            status
            featuredImage {
              url
              altText
            }
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
          }
        }
      }
    }
  `);
  const { data: productsData } = await productsRes.json();
  const products = productsData?.products?.edges?.map(e => e.node) || [];

  return { products, savedIds };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  // Collect all checked product IDs
  const selectedIds = formData.getAll("productId");

  const shopRes = await admin.graphql(`#graphql query { shop { id } }`);
  const { data: shopData } = await shopRes.json();
  const shopId = shopData.shop.id;

  const res = await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: UPSELL_NAMESPACE,
            key: UPSELL_KEY,
            type: "json",
            value: JSON.stringify(selectedIds),
          },
        ],
      },
    }
  );

  const { data } = await res.json();
  const errors = data?.metafieldsSet?.userErrors || [];
  if (errors.length) {
    return { success: false, errors };
  }

  return { success: true, selectedIds };
};

export default function UpsellPage() {
  const { products, savedIds } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const isSaving = ["loading", "submitting"].includes(fetcher.state);
  const currentIds = fetcher.data?.selectedIds || savedIds;

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Upsell products saved!");
    }
    if (fetcher.data?.errors?.length) {
      shopify.toast.show("Error saving upsell products", { isError: true });
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Upsell Products">

      <s-section heading="How upsell works">
        <s-paragraph>
          Select products below that will appear as recommendations inside the cart drawer.
          If no products are selected, the drawer uses Shopify&apos;s automatic product
          recommendations based on what&apos;s already in the cart.
        </s-paragraph>
      </s-section>

      <fetcher.Form method="POST">
        <s-section heading="Select products to recommend">
          <s-stack direction="block" gap="base">

            {products.length === 0 && (
              <s-paragraph>No products found in your store.</s-paragraph>
            )}

            {products.map(product => {
              const isChecked = currentIds.includes(product.id);
              const price = product.variants?.edges?.[0]?.node?.price;
              const imageUrl = product.featuredImage?.url;

              return (
                <s-box
                  key={product.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background={isChecked ? "highlight" : "default"}
                >
                  <s-stack direction="inline" gap="base" blockAlign="center">
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt={product.featuredImage?.altText || product.title}
                        width={48}
                        height={48}
                        style={{ objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                      />
                    )}
                    <s-stack direction="block" gap="none" style={{ flex: 1 }}>
                      <s-text emphasis>{product.title}</s-text>
                      {price && <s-text subdued>${price}</s-text>}
                      <s-text subdued style={{ fontSize: 12 }}>
                        {product.status === "ACTIVE" ? "Active" : "Draft"}
                      </s-text>
                    </s-stack>
                    <input
                      type="checkbox"
                      name="productId"
                      value={product.id}
                      defaultChecked={isChecked}
                      style={{ width: 18, height: 18, cursor: "pointer" }}
                    />
                  </s-stack>
                </s-box>
              );
            })}

            <s-paragraph subdued>
              {currentIds.length === 0
                ? "No products selected — Shopify automatic recommendations will be used."
                : `${currentIds.length} product(s) selected as upsell recommendations.`}
            </s-paragraph>

            <s-button
              submit
              variant="primary"
              {...(isSaving ? { loading: true } : {})}
            >
              Save upsell products
            </s-button>

          </s-stack>
        </s-section>
      </fetcher.Form>

    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
