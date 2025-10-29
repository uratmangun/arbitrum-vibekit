<<<<<<< ours
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { pregenWallets } from "@/db/schema";

export async function POST(request: Request) {
  try {
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

    // Invalidate cached wallet details so subsequent loads refresh
    revalidateTag("pregen-wallet", "max");
    if (pregenId) revalidateTag(`pregen-wallet:${pregenId}`, "max");
    // Optionally, if you tag by walletId elsewhere, revalidate here too
    if (walletId) revalidateTag(`pregen-wallet:wallet:${walletId}`, "max");

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
|||||||
=======
import { NextResponse } from "next/server";
import { getParaClient } from "@/lib/para-client";

export async function POST(request: Request) {
  try {
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
    }

    // Load the user share into Para client
    await para.setUserShare(userShare);

    // Claim the pregenerated wallet
    const recoverySecret = await para.claimPregenWallets();

    return NextResponse.json({
      success: true,
      recoverySecret,
      message: "Wallet claimed successfully",
    });
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
>>>>>>> theirs
