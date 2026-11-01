export function CommunitySwitcher({ communities, communityId }: {
  communities: Array<{ id: string; name: string }>;
  communityId: string;
}) {
  return (
    <form className="editorial-inline-actions" method="get">
      <label htmlFor="community-selector">Community</label>
      <select id="community-selector" name="communityId" defaultValue={communityId}>
        {communities.map((community) => (
          <option key={community.id} value={community.id}>{community.name}</option>
        ))}
      </select>
      <button className="secondary-button" type="submit">Switch community</button>
    </form>
  );
}
