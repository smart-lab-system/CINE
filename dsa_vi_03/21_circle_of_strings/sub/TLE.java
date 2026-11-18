

// User function Template for Java

class Solution {
    private void dfs1(int node, ArrayList<ArrayList<Integer>> adj, boolean[] visited, Stack<Integer> stack) {
       visited[node] = true;
       for (int neighbor : adj.get(node)) {
           if (!visited[neighbor]) {
               dfs1(neighbor, adj, visited, stack);
           }
       }
       stack.push(node);
   }

   private void dfs(int node, ArrayList<ArrayList<Integer>> adj, boolean[] visited) {
       visited[node] = true;
       for (int neighbor : adj.get(node)) {
           if (!visited[neighbor]) {
               dfs(neighbor, adj, visited);
           }
       }
   }
   public int isCircle(String arr[]) {
       // code here
        int n = arr.length;

       // Build adjacency list
       if(n == 1){
           if(arr[0].charAt(0) == arr[0].charAt(arr[0].length() - 1)) return 1;
           return 0;
       }
       ArrayList<ArrayList<Integer>> adj = new ArrayList<>();
       for (int i = 0; i < n; i++) {
           adj.add(new ArrayList<>());
       }

       for (int i = 0; i < n; i++) {
           String str1 = arr[i];
           for (int j = 0; j < n; j++) {
               if (i == j) continue;
               String str2 = arr[j];
               if (str1.charAt(str1.length() - 1) == str2.charAt(0)) {
                   adj.get(i).add(j);
               }
           }
       }

       Stack<Integer> stack = new Stack<>();
       boolean[] visited = new boolean[n];
       for (int i = 0; i < n; i++) {
           if (!visited[i]) {
               dfs1(i, adj, visited, stack);
           }
       }

       // Reverse the graph
       ArrayList<ArrayList<Integer>> revAdj = new ArrayList<>();
       for (int i = 0; i < n; i++) {
           revAdj.add(new ArrayList<>());
       }

       for (int i = 0; i < n; i++) {
           for (int neighbor : adj.get(i)) {
               revAdj.get(neighbor).add(i);
           }
       }

       //  Check strongly connected components in reversed graph
       Arrays.fill(visited, false);
       int count = 0;
       while (!stack.isEmpty()) {
           int curr = stack.pop();
           if (!visited[curr]) {
               dfs(curr, revAdj, visited);
               count++;
           }
       }

       // Return 1 if strongly connected, otherwise 0
       return count == 1 ? 1 : 0;
   }
}