
// GET /api/stables/:stableId/priorities — all horse priorities for this stable (horse × user pairs)
router.get('/priorities', authenticate, async (req: AuthRequest, res: Response) => {
  if (!await requireStableManageAccess(req, res)) return;
  try {
    const priorities = await prisma.horsePriority.findMany({
      where: { horse: { stableId: req.params.stableId } },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
        horse: { select: { id: true, name: true, photoUrl: true } },
      },
    });
    res.json(priorities);
  } catch (err) {
    console.error('List stable priorities error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
