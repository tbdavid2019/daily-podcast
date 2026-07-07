import { getBaseUrl, sha256Hex, skillDocuments } from '@/lib/discovery'

export async function GET() {
  const baseUrl = getBaseUrl()
  const skills = await Promise.all(Object.values(skillDocuments).map(async skill => ({
    name: skill.name,
    type: skill.type,
    description: skill.description,
    url: `${baseUrl}${skill.path}`,
    sha256: await sha256Hex(skill.content),
  })))

  return Response.json({
    $schema: 'https://agentskills.io/schemas/agent-skills-index-v0.2.0.json',
    skills,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
