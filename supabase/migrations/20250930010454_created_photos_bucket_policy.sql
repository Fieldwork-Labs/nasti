create policy "allow_org_access"
on storage.objects
for ALL
to authenticated
using ((bucket_id = 'collection-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT get_user_organisation_id() AS get_user_organisation_id))::text));