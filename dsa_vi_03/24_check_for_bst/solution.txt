

// User function Template for Java

class Solution {
    private Integer prev= null;
    // Function to check whether a Binary Tree is BST or not.
    boolean isBST(Node root) {
        // code here.
        return inorderCheck(root);
    }
    private boolean inorderCheck(Node node) {
        if (node == null) return true;
        if (!inorderCheck(node.left)) return false;
        if (prev != null && node.data <= prev) return false;
        prev= node.data;
        return inorderCheck(node.right);
    }
}