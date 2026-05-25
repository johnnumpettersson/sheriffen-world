export interface GeoLocation {
  lat: number;
  lng: number;
  country?: string;
  countryCode?: string;
  continent?: string;
  city?: string;
  landmark?: string;
}

export interface GalleryImage {
  id: string;
  name: string;
  dataUrl: string;
  mapThumbnailUrl: string;
  thumbnailUrl: string;
  previewUrl: string;
  location: GeoLocation | null;
  comment: string | null;
  takenAt: Date | null;
  uploadedAt: Date;
  size: number;
  type: string;
  mediaType?: "image" | "video";
  duration?: number;
}
