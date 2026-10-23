// The things we have made besides this app, shown at the very bottom of Home under "More of our creations". To add one, add a line here (name, the website it opens) and, when it has
// a logo, put the logo in public/creations/ and name its file in `logo`. They are shown three to a line, in the order of this list.
export interface Creation {
  name: string;
  url: string;
  /** file name inside public/creations/, e.g. "my-site.png"; without one the button shows the name alone */
  logo?: string;
}

export const MORE_CREATIONS: Creation[] = [
  { name: 'Mannerly', url: 'https://manvendravaghela.wixsite.com/mannerly' },
  { name: 'Sizzle', url: 'https://manvendravaghela.wixsite.com/sizzle' },
  { name: 'Saraah Robotics', url: 'https://padmanabhsingh1110.wixsite.com/my-site' },
  { name: 'Noob Learners', url: 'https://padmanabhsingh1110.wixsite.com/the-noob-learners' },
];
