import type { Metadata } from "next";
import { CostimationGame } from "./CostimationGame";

export const metadata: Metadata = { title: "Costimation · TopPic", description: "Guess what real products cost. The closer your guess, the further your car drives." };

export default function CostimationPage() {
  return <CostimationGame />;
}
