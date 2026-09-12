export const PUBLIC_API_SCHEMA_VERSION = 1 as const;

export type PublicSite = {
  key: string;
  name: string;
};

export type PublicSiteContent = {
  profile: string;
  sections: {
    hero: {
      title: string;
      description: string;
      image: { url: string } | null;
      ctaLabel: string;
      ctaUrl: string;
    };
    promotion: {
      enabled: boolean;
      title: string;
      description: string;
      image: { url: string } | null;
      ctaLabel: string;
      ctaUrl: string;
    };
  };
};

export type PublicProductImage = { url: string };

export type PublicProduct3D =
  | { available: false }
  | {
      available: true;
      modelUrl: string;
      transform: {
        scale: number;
        position: { x: number; y: number; z: number };
        rotationDegrees: { x: number; y: number; z: number };
      };
      viewer: { framing: 'auto' };
      arEnabled: boolean;
    };

export type PublicProduct = {
  key: string;
  name: string;
  description: string;
  price: { amountMinor: number; currency: string };
  stock: number;
  images: { main: PublicProductImage | null; gallery: PublicProductImage[] };
  cta: { label: string | null; url: string | null };
  model3d: PublicProduct3D;
};

export type PublicSiteResponse = {
  schemaVersion: typeof PUBLIC_API_SCHEMA_VERSION;
  site: PublicSite;
  content: PublicSiteContent | null;
  products: PublicProduct[];
};

export type PublicSiteContentResponse = {
  schemaVersion: typeof PUBLIC_API_SCHEMA_VERSION;
  site: PublicSite;
  content: PublicSiteContent | null;
};

export type PublicProductsResponse = {
  schemaVersion: typeof PUBLIC_API_SCHEMA_VERSION;
  site: PublicSite;
  products: PublicProduct[];
};

export type PublicProductResponse = {
  schemaVersion: typeof PUBLIC_API_SCHEMA_VERSION;
  site: PublicSite;
  product: PublicProduct;
};
