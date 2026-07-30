"use client";
import { useEffect, useState } from "react";
import ReadyBuildDetailPage from "./components/ReadyBuildDetailPage";
export default function BuildPage() { const [id, setId] = useState(null); useEffect(() => setId(new URLSearchParams(window.location.search).get("id")), []); return id ? <ReadyBuildDetailPage listingId={id} /> : null; }
