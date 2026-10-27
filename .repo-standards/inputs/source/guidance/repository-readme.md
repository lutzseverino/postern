# Repository README adoption guidance

Target the adopting repository's top-level `README.md` and bring it into line
with the `repository-readme` rules. Preserve accurate, useful project facts
from the existing README, and keep useful existing badges once their labels and
links are verified against repository evidence. Confirm that the badges cover
every language and runtime a user or contributor needs, using package
manifests, language configuration, runtime version fields, and other repository
evidence. A TypeScript package needs a TypeScript badge; a runtime badge
carries the required major version.

Assess an optional leading project image using the owner's request and
repository evidence. Preserve a useful existing README image; an available
asset may be suitable, but its filename being a favicon alone does not make it
a README logo. Availability never makes an image mandatory, and absence needs
no new image or questionnaire. If using light and dark variants, verify that
they represent the same image, match the respective GitHub themes, and have a
usable fallback. Assess whether the image repeats the adjacent title and is
decorative, needing empty alt text, or communicates additional information
needing an appropriate text alternative, as the rules describe.

Report evidence for descriptions, commands, technology choices, badges, and
links, and for image suitability and accessibility when an image is used.
The read-only structural check permits one centered plain image or picture
before the title, rejects additional images and other preceding rendered
content, and checks title, description and badge centering. A picture needs
one visible image fallback; its source alternatives count as one image.
The check also covers a one-sentence description free of glossary terms, section order,
the required Contributing and Documentation sections when their targets exist,
Contributing,
Documentation, and License sections holding only their link as a plain
paragraph, and consistency between a single root license file and the License
section. It does not establish factual accuracy, badge choice, command
behavior, Features wording, license correctness, image suitability, actual
theme rendering, source availability, accessibility, or prose quality, and it
does not enforce the approximate word count.
