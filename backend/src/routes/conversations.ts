import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

export const conversationsRouter = Router();

const ORG_ID = "default-org";

// GET /api/conversations
conversationsRouter.get("/", async (_req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { organizationId: ORG_ID },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1, // just last message for preview
        },
      },
      orderBy: { lastMessageAt: "desc" },
    });
    res.json(conversations);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to list conversations" });
  }
});

// GET /api/conversations/:id
conversationsRouter.get("/:id", async (req, res) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, organizationId: ORG_ID },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    // Mark as read
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { unreadCount: 0 },
    });

    res.json(conversation);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to get conversation" });
  }
});

const createConversationSchema = z.object({
  subject: z.string().min(1),
  channel: z.enum(["internal", "sms", "email", "phone"]).default("internal"),
  participants: z.array(z.string()).default([]),
  message: z.string().min(1),
  senderRole: z.enum(["dispatch", "technician", "customer", "system"]).default("dispatch"),
  sender: z.string().min(1),
});

// POST /api/conversations
conversationsRouter.post("/", async (req, res) => {
  const parsed = createConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: ORG_ID,
        subject: parsed.data.subject,
        channel: parsed.data.channel,
        participants: parsed.data.participants,
        lastMessageAt: new Date(),
        messages: {
          create: {
            sender: parsed.data.sender,
            senderRole: parsed.data.senderRole,
            content: parsed.data.message,
          },
        },
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    res.status(201).json(conversation);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create conversation" });
  }
});

const sendMessageSchema = z.object({
  sender: z.string().min(1),
  senderRole: z.enum(["dispatch", "technician", "customer", "system"]).default("dispatch"),
  content: z.string().min(1),
});

// POST /api/conversations/:id/messages
conversationsRouter.post("/:id/messages", async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, organizationId: ORG_ID },
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    const message = await prisma.message.create({
      data: {
        conversationId: req.params.id,
        sender: parsed.data.sender,
        senderRole: parsed.data.senderRole,
        content: parsed.data.content,
      },
    });

    await prisma.conversation.update({
      where: { id: req.params.id },
      data: {
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });

    res.status(201).json(message);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Failed to send message" });
  }
});
