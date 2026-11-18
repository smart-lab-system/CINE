//Back-end complete function Template for Java

class Graph {
    int V;
    LinkedList<Integer> adj[];
    int in[];

    @SuppressWarnings("unchecked")
    public Graph(int v) {
        V = v;
        adj = new LinkedList[v];
        in = new int[V];
        for (int i = 0; i < v; ++i) {
            adj[i] = new LinkedList();
            in[i] = 0;
        }
    }

    void addEdge(int v, int w) {
        adj[v].add(w);
        in[w]++;
    }

    void DFSUtil(int v, Boolean visited[]) {
        visited[v] = true;
        int n;
        Iterator<Integer> i = adj[v].iterator();
        while (i.hasNext()) {
            n = i.next();
            if (!visited[n]) DFSUtil(n, visited);
        }
    }

    Graph getTranspose() {
        Graph g = new Graph(V);
        for (int v = 0; v < V; v++) {
            Iterator<Integer> i = adj[v].listIterator();
            while (i.hasNext()) {
                g.adj[i.next()].add(v);
                (g.in[v])++;
            }
        }
        return g;
    }

    Boolean isSC() {
        // Step 1: Mark all the vertices as not visited (For
        // first DFS)
        Boolean visited[] = new Boolean[V];
        Arrays.fill(visited, false);

        // Step 2: DFS starting from 1st non-zero degree vertex
        int n;
        for (n = 0; n < V; n++) {
            if (adj[n].size() > 0) break;
        }
        DFSUtil(n, visited);

        // If DFS traversal doesn't visit all vertices, then return false.
        for (int i = 0; i < V; i++)
            if (!visited[i] && adj[i].size() > 0) return false;

        // Step 3: Create a reversed graph
        Graph gr = getTranspose();

        // Step 4: Mark all the vertices as not visited (For second DFS)
        Arrays.fill(visited, false);

        // Step 5: Do DFS for reversed graph starting from first vertex.
        // Staring Vertex must be same starting point of first DFS
        gr.DFSUtil(n, visited);

        // If all vertices are not visited in second DFS, then
        // return false
        for (int i = 0; i < V; i++)
            if (!visited[i] && adj[i].size() > 0) return false;
        return true;
    }

    /* This function returns true if the directed graph has an eulerian
    cycle, otherwise returns false */
    Boolean isEulerianCycle() {
        // Check if all non-zero degree vertices are connected
        if (isSC() == false) return false;
        // Check if in degree and out degree of every vertex is same
        for (int i = 0; i < V; i++)
            if (adj[i].size() != in[i]) return false;
        return true;
    }
}

class Solution {
    public int isCircle(String[] arr) {
        int N = arr.length;
        Graph g = new Graph(26);
        for (int i = 0; i < N; i++) {
            String s = arr[i];
            g.addEdge(s.charAt(0) - 'a', s.charAt(s.length() - 1) - 'a');
        }

        if (g.isEulerianCycle()) {
            return 1;
        } else {
            return 0;
        }
    }
}