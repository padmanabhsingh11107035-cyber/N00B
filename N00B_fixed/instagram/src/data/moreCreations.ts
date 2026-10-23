// The things we have made besides this app, shown at the very bottom of Home under "More of our creations". To add one, put its logo in public/creations/ and add a line here
// (name, the website it opens, the logo's file name). They are shown three to a line, in the order of this list.
export interface Creation {
  name: string;
  url: string;
  /** file name inside public/creations/, e.g. "my-site.png" */
  logo: string;
}

export const MORE_CREATIONS: Creation[] = [];
