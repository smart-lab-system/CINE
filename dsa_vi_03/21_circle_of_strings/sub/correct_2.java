

// User function Template for Java

class Graph {
    List<List<Integer>> adj;
    int[] indegree;
    int[] outdegree;
    int V;
    public Graph(int n) {
        this.V = n;
        adj = new ArrayList<>();
        for(int i=0; i<V; i++) {
            adj.add(new ArrayList<>());
        }
        indegree = new int[V];
        outdegree = new int[V];
    }
    
    public void addNodes(char from, char to) {
        int u = from - 'a';
        int v = to - 'a';
        adj.get(u).add(v);
        indegree[v]++;
        outdegree[u]++;
    }
    
    public boolean isDegreeSame() {
        for(int i=0; i<V; i++) {
            // System.out.println("for "+i+" in:"+indegree[i]+", out:"+outdegree[i]);
            if(indegree[i] != outdegree[i]) {
                return false;
            }
        }
        return true;
    }
    
    public void dfs(int node, int[] vis) {
        vis[node] = 1;
        for(int nextNode: adj.get(node)) {
            if(vis[nextNode] == 0) {
                dfs(nextNode, vis);
            }
        }
    }
    public boolean isSingleComponent() {
        int[] vis = new int[V];
        int i;
        for(i=0; i<V; i++) {
            // System.out.println("i:"+adj.get(i).size());
            if(adj.get(i).size()>0) {
                break;
            }
        }
        if(i == V) {
            return true;
        }
        dfs(i, vis);
        // System.out.println("I:"+i);
        for(i=0; i<V; i++) {
            // System.out.println("for "+i+" vis:"+vis[i]);
            if(adj.get(i).size()>0 && vis[i] == 0) {
                return false;
            }
        }
        return true;
    }
}
class Solution {
    public int isCircle(String arr[]) {
        Graph graph = new Graph(26);
        char lastNode = '\0';
        for(String str: arr) {
            char from = str.charAt(0);
            char to = str.charAt(str.length()-1);
            graph.addNodes(from, to);
            lastNode = to;
        }
        // return graph.isDegreeSame()?1:0;
        if(graph.isDegreeSame() == true && graph.isSingleComponent() == true) {
            return 1;
        }
        
        return 0;
    }
}