declare module 'cytoscape-elk' {
  import type cytoscape from 'cytoscape';
  const register: (cytoscape: typeof cytoscape) => void;
  export default register;
}