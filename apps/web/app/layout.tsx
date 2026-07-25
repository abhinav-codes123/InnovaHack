import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VeriFact AI — Evidence before answers",
    template: "%s · VeriFact AI"
  },
  description:
    "An evidence-first research and claim verification platform with transparent citations, contradictions, and confidence."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
