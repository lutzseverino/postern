# Repository README adoption guidance

Target the adopting repository's top-level `README.md` and bring it into line
with the `repository-readme` rules. Preserve accurate, useful project facts
from the existing README, and keep useful existing badges once their labels and
links are verified against repository evidence. Confirm that the badges cover
every language and runtime a user or contributor needs, using package
manifests, language configuration, runtime version fields, and other repository
evidence. A TypeScript package needs a TypeScript badge; a runtime badge
carries the required major version.

Bring the README description and the repository's GitHub About description
into agreement as the same sentence. The About description is a repository
setting, changed for example with `gh repo edit --description`; it is not a
file in the adoption's targets.

When the project has an icon, an image it already uses as its own mark such as
its site icon, favicon or app avatar, use that icon as the header's project
image. Find it from repository evidence, such as site assets, and the owner's
request. A project without an icon needs no new image or questionnaire. If
using light and dark variants, verify that they represent the same image,
match the respective GitHub themes, and have a usable fallback. Assess whether
the image repeats the adjacent title and is decorative, needing empty alt
text, or communicates additional information needing an appropriate text
alternative, as the rules describe.

Report evidence for descriptions, commands, technology choices, badges, and
links, and for image suitability and accessibility when an image is used.
The read-only structural check permits one centered plain image or picture
before the title, rejects additional images and other preceding rendered
content, and checks title, description and badge centering. A picture needs
one visible image fallback; its source alternatives count as one image.
The check also covers a one-sentence description free of glossary terms that
matches the GitHub About description, section order,
the required Contributing and Documentation sections when their targets exist,
Contributing,
Documentation, and License sections holding only their link as a plain
paragraph, and consistency between a single root license file and the License
section. It does not establish factual accuracy, badge choice, command
behavior, Features wording, license correctness, whether the project has an
icon, image suitability, actual theme rendering, source availability,
accessibility, or prose quality, and it does not enforce the approximate word
count. When it cannot read the About description, for example without a
signed-in `gh`, it reports that it did not compare it; compare the two texts
yourself.
