import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
<<<<<<< ours
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
||||||| ancestor
import { getParaClient } from "@/lib/para-client";
=======
import { revalidateTag } from "next/cache";
<<<<<<< ours
>>>>>>> theirs
||||||| ancestor
=======
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
>>>>>>> theirs

export async function POST(request: Request) {
  try {
<<<<<<< ours
    // Accept flexible payloads. We don't rely on recoverySecret here.
    // Clients may send { pregenId } (preferred) or { walletId } or nothing.
    let pregenId: string | undefined;
    let walletId: string | undefined;
    try {
      const body = await request.json();
      pregenId = body?.pregenId;
      walletId = body?.walletId;
    } catch {
      // no JSON body provided; proceed with generic revalidation
    }

<<<<<<< ours
    // If we have a pregenId, mark the wallet as claimed in the database
    if (pregenId) {
      await db
        .update(pregenWallets)
        .set({ claimedAt: sql`now()` })
        .where(
          and(eq(pregenWallets.id, pregenId), isNull(pregenWallets.claimedAt)),
        );
    } else if (walletId) {
      // If we only have walletId, update by walletId
      await db
        .update(pregenWallets)
        .set({ claimedAt: sql`now()` })
        .where(
          and(
            eq(pregenWallets.walletId, walletId),
            isNull(pregenWallets.claimedAt),
          ),
        );
||||||| ancestor
    const { userShare } = await request.json();

    if (!userShare) {
      return NextResponse.json(
        { error: "User share is required" },
        { status: 400 },
      );
    }

    // Initialize Para client
    const para = getParaClient();

    // Check if user is fully authenticated
    const isAuthenticated = await para.isFullyLoggedIn();

    if (!isAuthenticated) {
      return NextResponse.json(
        { error: "User must be fully authenticated with Para" },
        { status: 401 },
      );
=======
    // Accept flexible payloads. We don't rely on recoverySecret here.
    // Clients may send { pregenId } (preferred) or { walletId } or nothing.
    let pregenId: string | undefined;
    let walletId: string | undefined;
    try {
      const body = await request.json();
      pregenId = body?.pregenId;
      walletId = body?.walletId;
    } catch {
      // no JSON body provided; proceed with generic revalidation
>>>>>>> theirs
    }

<<<<<<< ours
    // Invalidate cached wallet details so subsequent loads refresh
    revalidateTag("pregen-wallet", "max");
    if (pregenId) revalidateTag(`pregen-wallet:${pregenId}`, "max");
    // Optionally, if you tag by walletId elsewhere, revalidate here too
    if (walletId) revalidateTag(`pregen-wallet:wallet:${walletId}`, "max");
||||||| ancestor
    // Load the user share into Para client
    await para.setUserShare(userShare);

    // Claim the pregenerated wallet
    const recoverySecret = await para.claimPregenWallets();
=======
||||||| ancestor
=======
    // If we have a pregenId, mark the wallet as claimed in the database
    if (pregenId) {
      await db
        .update(pregenWallets)
        .set({ claimedAt: sql`now()` })
        .where(
          and(eq(pregenWallets.id, pregenId), isNull(pregenWallets.claimedAt)),
        );
    } else if (walletId) {
      // If we only have walletId, update by walletId
      await db
        .update(pregenWallets)
        .set({ claimedAt: sql`now()` })
        .where(
          and(
            eq(pregenWallets.walletId, walletId),
            isNull(pregenWallets.claimedAt),
          ),
        );
    }

>>>>>>> theirs
    // Invalidate cached wallet details so subsequent loads refresh
    revalidateTag("pregen-wallet", "max");
    if (pregenId) revalidateTag(`pregen-wallet:${pregenId}`, "max");
    // Optionally, if you tag by walletId elsewhere, revalidate here too
<<<<<<< ours
    if (walletId) revalidateTag(`pregen-wallet:wallet:${walletId}`);
>>>>>>> theirs
||||||| ancestor
    if (walletId) revalidateTag(`pregen-wallet:wallet:${walletId}`);
=======
    if (walletId) revalidateTag(`pregen-wallet:wallet:${walletId}`, "max");
>>>>>>> theirs

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error claiming wallet:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to claim wallet",
      },
      { status: 500 },
    );
  }
}
