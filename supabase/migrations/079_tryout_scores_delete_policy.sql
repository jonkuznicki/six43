-- Allow org admins to delete tryout scores
create policy "tryout_scores: org admin can delete"
  on tryout_scores for delete
  using (tryout_is_member(org_id, array['org_admin']));
