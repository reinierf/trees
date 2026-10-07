// Contact address as char codes shifted by one, so it never appears in the source or the DOM;
// the mailto link is only built on click.
const CONTACT_CODES = [106, 111, 103, 112, 65, 99, 112, 110, 102, 111, 98, 117, 109, 98, 116, 47, 111, 109]

/** Opens a mail to the contact address. Via a throwaway link with target=_blank, so a webmail
 *  handler opens in a new tab instead of replacing the map. */
export function openContactMail(): void {
  const mailto = document.createElement('a')
  mailto.href = `mailto:${String.fromCharCode(...CONTACT_CODES.map((c) => c - 1))}`
  mailto.target = '_blank'
  mailto.rel = 'noopener'
  mailto.click()
}
